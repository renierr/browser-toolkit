import { Hono } from 'hono';
import type { Context } from 'hono';
import { getSyncRecords, upsertSyncRecord, getSyncMetadataSince } from '../lib/sync-db';

const sync = new Hono();

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(Bun.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

const maxMetadataLimit = readPositiveInteger('SYNC_MAX_METADATA_LIMIT', 1_000);
const maxPullIds = readPositiveInteger('SYNC_MAX_PULL_IDS', 1_000);
const maxPushRecords = readPositiveInteger('SYNC_MAX_PUSH_RECORDS', 1_000);
// Chiptune modules, signatures and sketch boards push base64 blobs through this
// route, so this ceiling is an abuse guard, not a size clients are expected to
// stay under. A 1 MiB cap here rejects a single ordinary sketch.
const maxRequestBytes = readPositiveInteger('SYNC_MAX_REQUEST_BYTES', 33_554_432);

type JsonBodyResult = { data: unknown } | { error: Response };
type SyncPushRecord = {
  id: string;
  data?: unknown;
  updatedAt: number;
  deleted?: boolean;
};

async function readJsonBody(c: Context): Promise<JsonBodyResult> {
  const contentLength = c.req.header('content-length');
  if (contentLength && Number(contentLength) > maxRequestBytes) {
    return {
      error: c.json({ success: false, error: 'Request payload exceeds the size limit' }, 413),
    };
  }

  const body = await c.req.raw.arrayBuffer();
  if (body.byteLength > maxRequestBytes) {
    return {
      error: c.json({ success: false, error: 'Request payload exceeds the size limit' }, 413),
    };
  }

  try {
    return { data: JSON.parse(new TextDecoder().decode(body)) as unknown };
  } catch {
    return { error: c.json({ success: false, error: 'Invalid JSON payload' }, 400) };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSyncPushRecord(value: unknown): value is SyncPushRecord {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    Number.isSafeInteger(value.updatedAt) &&
    (value.deleted === undefined || typeof value.deleted === 'boolean')
  );
}

function readMetadataLimit(value: string | undefined): number | Response | undefined {
  if (value === undefined) return undefined;

  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'limit must be a positive integer' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
  if (limit > maxMetadataLimit) {
    return new Response(
      JSON.stringify({ success: false, error: `limit exceeds the maximum of ${maxMetadataLimit}` }),
      { status: 413, headers: { 'content-type': 'application/json' } }
    );
  }
  return limit;
}

// Get all sync records for a tool
sync.get('/:toolId', (c) => {
  const toolId = c.req.param('toolId');
  const records = getSyncRecords(toolId);

  return c.json({
    success: true,
    records: records.map((r: any) => ({
      id: r.record_id,
      data: JSON.parse(r.data),
      updatedAt: r.updated_at,
      deleted: Boolean(r.deleted),
    })),
  });
});

// Get metadata-only for all sync records of a tool
sync.get('/:toolId/metadata', (c) => {
  const toolId = c.req.param('toolId');
  const limit = readMetadataLimit(c.req.query('limit'));
  if (limit instanceof Response) return limit;

  const metadata = getSyncMetadataSince(toolId, c.req.query('cursor'), limit);

  return c.json({
    success: true,
    ...metadata,
  });
});

// Pull specific full records by their IDs
sync.post('/:toolId/pull', async (c) => {
  const toolId = c.req.param('toolId');
  const body = await readJsonBody(c);
  if ('error' in body) return body.error;
  const ids = isObject(body.data) ? body.data.ids : undefined;

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return c.json({ success: false, error: 'Invalid ids format' }, 400);
  }
  if (ids.length > maxPullIds) {
    return c.json({ success: false, error: `ids exceeds the maximum of ${maxPullIds}` }, 413);
  }

  const records = getSyncRecords(toolId, ids as string[]);
  return c.json({
    success: true,
    records: records.map((r: any) => ({
      id: r.record_id,
      data: JSON.parse(r.data),
      updatedAt: r.updated_at,
      deleted: Boolean(r.deleted),
    })),
  });
});

// Push records to server
sync.post('/:toolId', async (c) => {
  const toolId = c.req.param('toolId');
  const body = await readJsonBody(c);
  if ('error' in body) return body.error;
  const records = isObject(body.data) ? body.data.records : undefined;

  if (!Array.isArray(records)) {
    return c.json({ success: false, error: 'Invalid records format' }, 400);
  }
  if (records.length > maxPushRecords) {
    return c.json(
      { success: false, error: `records exceeds the maximum of ${maxPushRecords}` },
      413
    );
  }
  if (records.some((record) => !isSyncPushRecord(record))) {
    return c.json({ success: false, error: 'Invalid record format' }, 400);
  }

  let updatedCount = 0;
  for (const record of records as SyncPushRecord[]) {
    const wasUpdated = upsertSyncRecord(
      toolId,
      record.id,
      JSON.stringify(record.data || {}),
      record.updatedAt,
      record.deleted ? 1 : 0
    );
    if (wasUpdated) updatedCount++;
  }

  return c.json({ success: true, updatedCount });
});

export default sync;
