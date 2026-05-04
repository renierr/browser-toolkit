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

export function upsertSyncRecord(toolId: string, recordId: string, data: string, updatedAt: number, deleted: number) {
  const existing = syncDb.query('SELECT updated_at FROM sync_data WHERE tool_id = ? AND record_id = ?').get(toolId, recordId) as { updated_at: number } | null;

  if (!existing || updatedAt > existing.updated_at) {
    syncDb.run(
      'INSERT OR REPLACE INTO sync_data (tool_id, record_id, data, updated_at, deleted) VALUES (?, ?, ?, ?, ?)',
      [toolId, recordId, data, updatedAt, deleted]
    );
    return true;
  }
  return false;
}

export function getSyncRecords(toolId: string) {
  return syncDb.query('SELECT * FROM sync_data WHERE tool_id = ?').all(toolId);
}
