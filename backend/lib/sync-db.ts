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
    return true;
  }
  return false;
}

export function getSyncRecords(toolId: string) {
  const rows = syncDb.query('SELECT * FROM sync_data WHERE tool_id = ?').all(toolId) as any[];
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
