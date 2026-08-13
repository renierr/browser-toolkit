import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';

// Ensure data directory exists
mkdirSync('./data', { recursive: true });

// Setup Sync SQLite Database
export const syncDb = new Database('./data/sync.sqlite', { create: true });

// Initialize sync table
syncDb.run(`
  CREATE TABLE IF NOT EXISTS sync_data (
    tool_id TEXT,
    record_id TEXT,
    data TEXT,
    updated_at INTEGER,
    deleted INTEGER DEFAULT 0,
    PRIMARY KEY (tool_id, record_id)
  )
`);

// Initialize sync binary table to store blobs as actual BLOBs
syncDb.run(`
  CREATE TABLE IF NOT EXISTS sync_binary (
    tool_id TEXT,
    record_id TEXT,
    key_name TEXT,
    mime_type TEXT,
    binary_data BLOB,
    PRIMARY KEY (tool_id, record_id, key_name)
  )
`);

syncDb.run(`
  CREATE TABLE IF NOT EXISTS sync_changes (
    revision INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id TEXT NOT NULL,
    record_id TEXT NOT NULL
  )
`);

syncDb.run(
  'CREATE INDEX IF NOT EXISTS idx_sync_changes_tool_revision ON sync_changes (tool_id, revision)'
);

syncDb.run(`
  INSERT INTO sync_changes (tool_id, record_id)
  SELECT tool_id, record_id
  FROM sync_data
  WHERE NOT EXISTS (SELECT 1 FROM sync_changes)
`);

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(Bun.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

// Tools that sync six-figure record counts (health dashboard) need a change log
// deep enough that a device coming back after a bulk import still resolves to an
// incremental cursor instead of a full re-scan.
const maxChangesPerTool = readPositiveInteger('SYNC_MAX_CHANGES_PER_TOOL', 1_000_000);

// Trimming on every upsert costs an index walk of maxChangesPerTool rows each
// time, which dominates bulk imports. Amortize it instead; the log is allowed to
// overshoot by at most one interval.
const changesPruneInterval = readPositiveInteger('SYNC_CHANGES_PRUNE_INTERVAL', 5_000);
const changesSincePrune = new Map<string, number>();

function recordChange(toolId: string, recordId: string): void {
  syncDb.run('INSERT INTO sync_changes (tool_id, record_id) VALUES (?, ?)', [toolId, recordId]);

  const pending = (changesSincePrune.get(toolId) ?? 0) + 1;
  if (pending < changesPruneInterval) {
    changesSincePrune.set(toolId, pending);
    return;
  }
  changesSincePrune.set(toolId, 0);

  syncDb.run(
    `DELETE FROM sync_changes
     WHERE tool_id = ?
       AND revision <= COALESCE(
         (SELECT revision FROM sync_changes
          WHERE tool_id = ?
          ORDER BY revision DESC
          LIMIT 1 OFFSET ?),
         0
       )`,
    [toolId, toolId, maxChangesPerTool]
  );
}

// Helper to recursively extract base64-encoded blobs and save them into sync_binary as BLOB
function extractAndStoreBlobs(toolId: string, recordId: string, obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (obj.__type === 'blob' && typeof obj.data === 'string') {
    const keyName = obj.keyName || 'binary_data';
    const mimeType = obj.mimeType || 'application/octet-stream';
    const buffer = Buffer.from(obj.data, 'base64');

    syncDb.run(
      'INSERT OR REPLACE INTO sync_binary (tool_id, record_id, key_name, mime_type, binary_data) VALUES (?, ?, ?, ?, ?)',
      [toolId, recordId, keyName, mimeType, buffer]
    );

    return {
      __type: 'blob_placeholder',
      mimeType,
      keyName,
    };
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => extractAndStoreBlobs(toolId, recordId, item));
  }

  const sanitized: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && val.__type === 'blob') {
      val.keyName = key;
    }
    sanitized[key] = extractAndStoreBlobs(toolId, recordId, val);
  }
  return sanitized;
}

// Helper to recursively reconstruct base64 blobs from SQLite BLOBs
function reconstructBlobs(toolId: string, recordId: string, obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (obj.__type === 'blob_placeholder') {
    const keyName = obj.keyName;
    const row = syncDb
      .query(
        'SELECT binary_data, mime_type FROM sync_binary WHERE tool_id = ? AND record_id = ? AND key_name = ?'
      )
      .get(toolId, recordId, keyName) as { binary_data: Uint8Array; mime_type: string } | null;

    if (row) {
      const base64 = Buffer.from(row.binary_data).toString('base64');
      return {
        __type: 'blob',
        mimeType: row.mime_type,
        data: base64,
      };
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => reconstructBlobs(toolId, recordId, item));
  }

  const reconstructed: any = {};
  for (const key of Object.keys(obj)) {
    reconstructed[key] = reconstructBlobs(toolId, recordId, obj[key]);
  }
  return reconstructed;
}

export function upsertSyncRecord(
  toolId: string,
  recordId: string,
  data: string,
  updatedAt: number,
  deleted: number
) {
  const existing = syncDb
    .query('SELECT updated_at FROM sync_data WHERE tool_id = ? AND record_id = ?')
    .get(toolId, recordId) as { updated_at: number } | null;

  if (!existing || updatedAt > existing.updated_at) {
    // Delete existing binary fields to prevent stale/duplicate entries
    syncDb.run('DELETE FROM sync_binary WHERE tool_id = ? AND record_id = ?', [toolId, recordId]);

    let finalData = data;
    if (deleted === 0) {
      try {
        const parsed = JSON.parse(data);
        const sanitized = extractAndStoreBlobs(toolId, recordId, parsed);
        finalData = JSON.stringify(sanitized);
      } catch (e) {
        console.error('[sync-db] Failed to parse and extract blobs:', e);
      }
    }

    syncDb.run(
      'INSERT OR REPLACE INTO sync_data (tool_id, record_id, data, updated_at, deleted) VALUES (?, ?, ?, ?, ?)',
      [toolId, recordId, finalData, updatedAt, deleted]
    );
    recordChange(toolId, recordId);
    return true;
  }
  return false;
}

export function getSyncRecords(toolId: string, ids?: string[]) {
  let rows: any[];
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    rows = syncDb
      .query(`SELECT * FROM sync_data WHERE tool_id = ? AND record_id IN (${placeholders})`)
      .all(toolId, ...ids) as any[];
  } else {
    rows = syncDb.query('SELECT * FROM sync_data WHERE tool_id = ?').all(toolId) as any[];
  }
  return rows.map((row) => {
    if (row.deleted) {
      return row;
    }
    try {
      const parsed = JSON.parse(row.data);
      const reconstructed = reconstructBlobs(toolId, row.record_id, parsed);
      row.data = JSON.stringify(reconstructed);
    } catch (e) {
      console.error('[sync-db] Failed to reconstruct blobs:', e);
    }
    return row;
  });
}

export function getSyncMetadata(toolId: string) {
  const rows = syncDb
    .query('SELECT record_id, updated_at, deleted FROM sync_data WHERE tool_id = ?')
    .all(toolId) as { record_id: string; updated_at: number; deleted: number }[];
  return rows.map((row) => ({
    id: row.record_id,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
  }));
}

export type SyncToolStats = {
  toolId: string;
  records: number;
  deleted: number;
  dataBytes: number;
  binaryRecords: number;
  binaryBytes: number;
  lastUpdatedAt: number | null;
};

// Aggregated per tool so a client can show what it has on the server without
// pulling any record data. `deleted` counts tombstones, which still occupy a
// row and still travel through metadata.
export function getSyncStats(toolId?: string): SyncToolStats[] {
  const where = toolId ? 'WHERE tool_id = ?' : '';
  const args = toolId ? [toolId] : [];

  const dataRows = syncDb
    .query(
      `SELECT tool_id,
              SUM(CASE WHEN deleted = 0 THEN 1 ELSE 0 END) AS records,
              SUM(CASE WHEN deleted = 1 THEN 1 ELSE 0 END) AS deleted,
              COALESCE(SUM(LENGTH(data)), 0) AS data_bytes,
              MAX(updated_at) AS last_updated_at
         FROM sync_data ${where}
        GROUP BY tool_id`
    )
    .all(...args) as {
    tool_id: string;
    records: number;
    deleted: number;
    data_bytes: number;
    last_updated_at: number | null;
  }[];

  const binaryRows = syncDb
    .query(
      `SELECT tool_id,
              COUNT(*) AS binary_records,
              COALESCE(SUM(LENGTH(binary_data)), 0) AS binary_bytes
         FROM sync_binary ${where}
        GROUP BY tool_id`
    )
    .all(...args) as { tool_id: string; binary_records: number; binary_bytes: number }[];

  const binaryByTool = new Map(binaryRows.map((row) => [row.tool_id, row]));
  const stats = new Map<string, SyncToolStats>();

  for (const row of dataRows) {
    const binary = binaryByTool.get(row.tool_id);
    stats.set(row.tool_id, {
      toolId: row.tool_id,
      records: row.records ?? 0,
      deleted: row.deleted ?? 0,
      dataBytes: row.data_bytes ?? 0,
      binaryRecords: binary?.binary_records ?? 0,
      binaryBytes: binary?.binary_bytes ?? 0,
      lastUpdatedAt: row.last_updated_at,
    });
  }

  // A tool can hold blobs whose owning row was already hard-deleted, so the
  // binary table is not simply a subset of the data table.
  for (const row of binaryRows) {
    if (stats.has(row.tool_id)) continue;
    stats.set(row.tool_id, {
      toolId: row.tool_id,
      records: 0,
      deleted: 0,
      dataBytes: 0,
      binaryRecords: row.binary_records,
      binaryBytes: row.binary_bytes,
      lastUpdatedAt: null,
    });
  }

  return [...stats.values()].sort((a, b) => a.toolId.localeCompare(b.toolId));
}

type SyncMetadataResult = {
  records: ReturnType<typeof getSyncMetadata>;
  cursor: string;
  full: boolean;
  hasMore?: boolean;
  nextCursor?: string;
};

export function getSyncMetadataSince(
  toolId: string,
  cursor?: string,
  limit?: number
): SyncMetadataResult {
  if (cursor === undefined) {
    if (limit !== undefined) {
      return getFullSyncMetadataPage(toolId, limit);
    }
    return { records: getSyncMetadata(toolId), cursor: getSyncCursor(toolId), full: true };
  }

  const fullPage = parseFullPageCursor(cursor);
  if (fullPage) {
    if (limit === undefined) {
      return { records: getSyncMetadata(toolId), cursor: getSyncCursor(toolId), full: true };
    }
    return getFullSyncMetadataPage(toolId, limit, fullPage);
  }

  const revision = Number(cursor);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    if (limit !== undefined) {
      return getFullSyncMetadataPage(toolId, limit);
    }
    return { records: getSyncMetadata(toolId), cursor: getSyncCursor(toolId), full: true };
  }

  const oldest = syncDb
    .query('SELECT MIN(revision) AS revision FROM sync_changes WHERE tool_id = ?')
    .get(toolId) as { revision: number | null };
  const currentCursor = getSyncCursor(toolId);
  if (
    Number(cursor) > Number(currentCursor) ||
    (oldest.revision !== null && revision < oldest.revision - 1)
  ) {
    if (limit !== undefined) {
      return getFullSyncMetadataPage(toolId, limit);
    }
    return { records: getSyncMetadata(toolId), cursor: getSyncCursor(toolId), full: true };
  }

  if (limit !== undefined) {
    return getSyncMetadataPage(toolId, revision, limit, false);
  }

  const rows = syncDb
    .query(
      `SELECT data.record_id, data.updated_at, data.deleted
       FROM sync_data AS data
       INNER JOIN (
         SELECT record_id, MAX(revision) AS revision
         FROM sync_changes
         WHERE tool_id = ? AND revision > ?
         GROUP BY record_id
       ) AS changes ON changes.record_id = data.record_id
       WHERE data.tool_id = ?
       ORDER BY changes.revision ASC`
    )
    .all(toolId, revision, toolId) as {
    record_id: string;
    updated_at: number;
    deleted: number;
  }[];
  return {
    records: rows.map((row) => ({
      id: row.record_id,
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted),
    })),
    cursor: getSyncCursor(toolId),
    full: false,
  };
}

function parseFullPageCursor(cursor: string): { snapshot: string; recordId: string } | null {
  const match = /^full:(\d+):(.*)$/.exec(cursor);
  return match ? { snapshot: match[1], recordId: match[2] } : null;
}

function getFullSyncMetadataPage(
  toolId: string,
  limit: number,
  page?: { snapshot: string; recordId: string }
): SyncMetadataResult {
  const snapshot = page?.snapshot ?? getSyncCursor(toolId);
  const rows = syncDb
    .query(
      `SELECT record_id, updated_at, deleted
       FROM sync_data
       WHERE tool_id = ? AND record_id > ?
       ORDER BY record_id ASC
       LIMIT ?`
    )
    .all(toolId, page?.recordId ?? '', limit + 1) as {
    record_id: string;
    updated_at: number;
    deleted: number;
  }[];
  const hasMore = rows.length > limit;
  const records = hasMore ? rows.slice(0, limit) : rows;
  const lastRecordId = records.at(-1)?.record_id;

  return {
    records: records.map((row) => ({
      id: row.record_id,
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted),
    })),
    cursor: snapshot,
    full: true,
    hasMore,
    ...(hasMore && lastRecordId ? { nextCursor: `full:${snapshot}:${lastRecordId}` } : {}),
  };
}

function getSyncMetadataPage(
  toolId: string,
  revision: number,
  limit: number,
  full: boolean
): SyncMetadataResult {
  const rows = syncDb
    .query(
      `SELECT data.record_id, data.updated_at, data.deleted, changes.revision
       FROM sync_data AS data
       INNER JOIN (
         SELECT record_id, MAX(revision) AS revision
         FROM sync_changes
         WHERE tool_id = ? AND revision > ?
         GROUP BY record_id
       ) AS changes ON changes.record_id = data.record_id
       WHERE data.tool_id = ?
       ORDER BY changes.revision ASC
       LIMIT ?`
    )
    .all(toolId, revision, toolId, limit + 1) as {
    record_id: string;
    updated_at: number;
    deleted: number;
    revision: number;
  }[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const lastRevision = page.at(-1)?.revision;

  return {
    records: page.map((row) => ({
      id: row.record_id,
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted),
    })),
    cursor: String(lastRevision ?? getSyncCursor(toolId)),
    full,
    hasMore,
  };
}

function getSyncCursor(toolId: string): string {
  const row = syncDb
    .query('SELECT MAX(revision) AS revision FROM sync_changes WHERE tool_id = ?')
    .get(toolId) as { revision: number | null };
  return String(row.revision ?? 0);
}
