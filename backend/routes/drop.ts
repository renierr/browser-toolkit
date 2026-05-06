import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DROP_DIR = './data/drop';
const FILES_DIR = join(DROP_DIR, 'files');

// Ensure directories exist
mkdirSync(FILES_DIR, { recursive: true });

// Setup SQLite Database
const db = new Database(join(DROP_DIR, 'metadata.sqlite'), { create: true });

// Initialize tables
db.query(`
  CREATE TABLE IF NOT EXISTS drops (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL,
    expires_at INTEGER
  )
`).run();

const drop = new Hono();

// Helper to cleanup expired files
const cleanupExpired = () => {
  const now = Date.now();
  const expired = db.query('SELECT id, filename FROM drops WHERE expires_at IS NOT NULL AND expires_at < ?').all(now) as { id: string; filename: string }[];
  
  for (const item of expired) {
    try {
      const filePath = join(FILES_DIR, item.id);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      db.query('DELETE FROM drops WHERE id = ?').run(item.id);
      console.log(`[Drop] Auto-deleted expired file: ${item.filename} (${item.id})`);
    } catch (err) {
      console.error(`[Drop] Failed to delete expired file ${item.id}:`, err);
    }
  }
};

// List all files
drop.get('/', (c) => {
  cleanupExpired();
  const drops = db.query('SELECT * FROM drops ORDER BY uploaded_at DESC').all();
  return c.json({ success: true, drops });
});

// Upload file
drop.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file as File;
  const retention = body.retention as string; // in hours, or 'indefinite'
  const source = (body.source as string) || 'file';

  if (!file) {
    return c.json({ success: false, error: 'No file provided' }, 400);
  }

  const id = crypto.randomUUID();
  const filename = file.name || 'unnamed';
  const size = file.size;
  const type = file.type || 'application/octet-stream';
  const uploadedAt = Date.now();
  
  let expiresAt: number | null = null;
  if (retention !== 'indefinite') {
    const hours = parseInt(retention) || 24;
    expiresAt = uploadedAt + hours * 60 * 60 * 1000;
  }

  try {
    await Bun.write(join(FILES_DIR, id), file);

    db.query(`
      INSERT INTO drops (id, filename, size, type, source, uploaded_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, filename, size, type, source, uploadedAt, expiresAt);

    return c.json({ 
      success: true, 
      drop: { id, filename, size, type, source, uploadedAt, expiresAt } 
    });
  } catch (err) {
    console.error('[Drop] Upload failed:', err);
    return c.json({ success: false, error: 'Upload failed' }, 500);
  }
});

// Download/View file
drop.get('/:id', async (c) => {
  const id = c.req.param('id');
  const metadata = db.query('SELECT * FROM drops WHERE id = ?').get(id) as any;

  if (!metadata) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  const filePath = join(FILES_DIR, id);
  if (!existsSync(filePath)) {
    return c.json({ success: false, error: 'File data missing' }, 404);
  }

  const file = Bun.file(filePath);
  
  c.header('Content-Type', metadata.type);
  // Using inline so browser can preview if possible (images, pdfs)
  c.header('Content-Disposition', `inline; filename="${metadata.filename}"`);
  
  return c.body(file.stream());
});

// Delete file
drop.delete('/:id', (c) => {
  const id = c.req.param('id');
  const metadata = db.query('SELECT * FROM drops WHERE id = ?').get(id) as any;

  if (!metadata) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  try {
    const filePath = join(FILES_DIR, id);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    db.query('DELETE FROM drops WHERE id = ?').run(id);
    return c.json({ success: true });
  } catch (err) {
    console.error('[Drop] Delete failed:', err);
    return c.json({ success: false, error: 'Delete failed' }, 500);
  }
});

// Update retention to indefinite
drop.patch('/:id/keep', (c) => {
  const id = c.req.param('id');
  const metadata = db.query('SELECT * FROM drops WHERE id = ?').get(id) as any;

  if (!metadata) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  try {
    db.query('UPDATE drops SET expires_at = NULL WHERE id = ?').run(id);
    return c.json({ success: true });
  } catch (err) {
    console.error('[Drop] Update failed:', err);
    return c.json({ success: false, error: 'Update failed' }, 500);
  }
});

export default drop;
