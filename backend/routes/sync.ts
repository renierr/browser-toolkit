import { Hono } from 'hono';
import { getSyncRecords, upsertSyncRecord } from '../lib/sync-db';

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
      deleted: Boolean(r.deleted)
    }))
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
