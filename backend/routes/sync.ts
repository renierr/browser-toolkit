import { Hono } from 'hono';
import { getSyncRecords, upsertSyncRecord, getSyncMetadata } from '../lib/sync-db';

const sync = new Hono();

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
  const metadata = getSyncMetadata(toolId);

  return c.json({
    success: true,
    records: metadata,
  });
});

// Pull specific full records by their IDs
sync.post('/:toolId/pull', async (c) => {
  const toolId = c.req.param('toolId');
  const { ids } = await c.req.json();

  if (!Array.isArray(ids)) {
    return c.json({ success: false, error: 'Invalid ids format' }, 400);
  }

  const records = getSyncRecords(toolId, ids);
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
  const { records } = await c.req.json();

  if (!Array.isArray(records)) {
    return c.json({ success: false, error: 'Invalid records format' }, 400);
  }

  let updatedCount = 0;
  for (const record of records) {
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
