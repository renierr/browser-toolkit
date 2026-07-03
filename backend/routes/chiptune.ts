import { Hono } from 'hono';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

// Folder the user drops their MOD/IT/XM collection into. Configurable so a big
// library can live outside ./data (e.g. on another drive).
const AUDIO_DIR = process.env.CHIPTUNE_DIR ?? './data/audio';
const ROOT = resolve(AUDIO_DIR);

const EXTS = new Set(['.mod', '.it', '.xm', '.s3m']);
const MIME: Record<string, string> = {
  '.mod': 'audio/x-mod',
  '.xm': 'audio/x-xm',
  '.it': 'audio/x-it',
  '.s3m': 'audio/x-s3m',
};

mkdirSync(AUDIO_DIR, { recursive: true });

// The folder can be huge, so we scan once and cache the relative paths in
// memory. Random selection is then O(1) instead of a full directory read per
// request. The index is rebuilt lazily after a TTL, or on demand (?refresh=1).
const INDEX_TTL_MS = 5 * 60 * 1000;
let fileIndex: string[] = [];
let indexedAt = 0;

function scanDir(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full, out);
    } else if (entry.isFile() && EXTS.has(extname(entry.name).toLowerCase())) {
      out.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
}

function getIndex(force = false): string[] {
  const now = Date.now();
  if (!force && fileIndex.length > 0 && now - indexedAt < INDEX_TTL_MS) {
    return fileIndex;
  }
  const out: string[] = [];
  if (existsSync(ROOT)) scanDir(ROOT, out);
  fileIndex = out;
  indexedAt = now;
  return fileIndex;
}

const encodeId = (relPath: string): string =>
  Buffer.from(relPath, 'utf8').toString('base64url');

function resolveId(id: string): string | null {
  let relPath: string;
  try {
    relPath = Buffer.from(id, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const target = resolve(ROOT, relPath);
  // Guard against path traversal: the resolved path must stay under ROOT.
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

function fileEntry(relPath: string) {
  const ext = extname(relPath).toLowerCase();
  const id = encodeId(relPath);
  return {
    id,
    fileName: relPath.split('/').pop() ?? relPath,
    path: relPath,
    format: ext.replace('.', '').toUpperCase(),
    downloadUrl: `/api/chiptune/file/${id}`,
  };
}

const chiptune = new Hono();

// GET /api/chiptune/random — one random module's metadata + download link.
chiptune.get('/random', (c) => {
  const index = getIndex(c.req.query('refresh') === '1');
  if (index.length === 0) {
    return c.json(
      { success: false, error: 'No modules in collection' },
      404,
    );
  }
  const relPath = index[Math.floor(Math.random() * index.length)]!;
  return c.json({ success: true, total: index.length, ...fileEntry(relPath) });
});

// GET /api/chiptune/list?page=1&pageSize=100 — paginated listing (for a future
// browse/list-playback UI). Kept cheap via the cached index.
chiptune.get('/list', (c) => {
  const index = getIndex(c.req.query('refresh') === '1');
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const pageSize = Math.min(
    500,
    Math.max(1, Number(c.req.query('pageSize') ?? 100) || 100),
  );
  const start = (page - 1) * pageSize;
  const files = index.slice(start, start + pageSize).map(fileEntry);
  return c.json({
    success: true,
    total: index.length,
    page,
    pageSize,
    files,
  });
});

// GET /api/chiptune/file/:id — stream a module's bytes. :id is the base64url of
// the path relative to the collection root.
chiptune.get('/file/:id', (c) => {
  const target = resolveId(c.req.param('id'));
  if (target === null) {
    return c.json({ success: false, error: 'Invalid id' }, 400);
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }
  const fileName = target.split(sep).pop() ?? 'module';
  const file = Bun.file(target);
  c.header('Content-Type', MIME[extname(target).toLowerCase()] ?? 'application/octet-stream');
  c.header('Content-Length', String(file.size));
  c.header('Content-Disposition', `inline; filename="${fileName}"`);
  return c.body(file.stream());
});

export default chiptune;
