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
    expires_at INTEGER,
    description TEXT
  )
`).run();

// Migration: add description column for existing databases
try {
  db.query('ALTER TABLE drops ADD COLUMN description TEXT').run();
} catch (_) {
  // Column already exists — ignore
}

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
  const isStreaming = c.req.header('X-Filename');
  let filename: string;
  let size: number;
  let type: string;
  let retention: string;
  let source: string;
  let content: any;

  if (isStreaming) {
    console.log(`[Drop] Receiving stream: ${c.req.header('X-Filename')}`);
    filename = decodeURIComponent(c.req.header('X-Filename')!);
    retention = c.req.header('X-Retention') || '24';
    source = c.req.header('X-Source') || 'file';
    type = c.req.header('Content-Type') || 'application/octet-stream';
    content = c.req.raw.body; // Native ReadableStream
    size = parseInt(c.req.header('Content-Length') || '0');
  } else {
    // Fallback multipart path
    const body = await c.req.parseBody();
    const file = body.file as File;
    if (!file) {
      return c.json({ success: false, error: 'No file provided' }, 400);
    }
    filename = file.name || 'unnamed';
    size = file.size;
    type = file.type || 'application/octet-stream';
    retention = body.retention as string;
    source = (body.source as string) || 'file';
    content = file;
  }

  const id = crypto.randomUUID();
  const uploadedAt = Date.now();
  
  let expiresAt: number | null = null;
  if (retention !== 'indefinite') {
    const hours = parseInt(retention) || 24;
    expiresAt = uploadedAt + hours * 60 * 60 * 1000;
  }

  try {
    console.log(`[Drop] Starting upload: ${filename} (${isStreaming ? 'streaming' : 'multipart'})`);
    
    if (isStreaming && c.req.raw.body) {
      // Manual streaming writer: most robust way to pipe a request body to a file in Bun
      const writer = Bun.file(join(FILES_DIR, id)).writer();
      const reader = c.req.raw.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
      }
      await writer.end();
    } else {
      await Bun.write(join(FILES_DIR, id), content);
    }
    
    console.log(`[Drop] Write complete: ${id}`);

    // If streaming, we might not have had the size from headers, so we check the file on disk
    if (!size || size === 0) {
      const stats = Bun.file(join(FILES_DIR, id));
      size = stats.size;
    }

    db.query(`
      INSERT INTO drops (id, filename, size, type, source, uploaded_at, expires_at, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, filename, size, type, source, uploadedAt, expiresAt, null);

    return c.json({ 
      success: true, 
      drop: { id, filename, size, type, source, uploadedAt, expiresAt, description: null }
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

// Update description
drop.patch('/:id/description', async (c) => {
  const id = c.req.param('id');
  const metadata = db.query('SELECT * FROM drops WHERE id = ?').get(id) as any;

  if (!metadata) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  try {
    const body = await c.req.json();
    const description = typeof body.description === 'string' ? body.description : '';
    db.query('UPDATE drops SET description = ? WHERE id = ?').run(description, id);
    return c.json({ success: true });
  } catch (err) {
    console.error('[Drop] Update description failed:', err);
    return c.json({ success: false, error: 'Update failed' }, 500);
  }
});

// Update retention
drop.patch('/:id/retention', async (c) => {
  const id = c.req.param('id');
  const metadata = db.query('SELECT * FROM drops WHERE id = ?').get(id) as any;

  if (!metadata) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  try {
    const body = await c.req.json();
    const retention = body.retention;

    let expiresAt: number | null = null;
    if (retention !== 'indefinite') {
      const hours = parseInt(retention) || 24;
      expiresAt = metadata.uploaded_at + hours * 60 * 60 * 1000;
    }

    db.query('UPDATE drops SET expires_at = ? WHERE id = ?').run(expiresAt, id);
    return c.json({ success: true, expiresAt });
  } catch (err) {
    console.error('[Drop] Update retention failed:', err);
    return c.json({ success: false, error: 'Update failed' }, 500);
  }
});

export default drop;

