import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';

const app = new Hono();

// Ensure data directory exists
mkdirSync('./data', { recursive: true });

// Setup a simple SQLite Database for demonstration
const db = new Database('./data/mydb.sqlite', { create: true });
db.query('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, message TEXT)').run();

// 1. Health check endpoint (used by frontend to detect backend)
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

// 1.5 System info endpoint
app.get('/api/info', (c) => {
  return c.json({
    status: 'ok',
    time: new Date().toISOString(),
    runtime: 'Bun',
    version: Bun.version,
    os: process.platform,
    arch: process.arch,
  });
});

// 2. Simple SQLite example endpoint
app.get('/api/db-test', (c) => {
  // Insert a row
  const insert = db.query('INSERT INTO test (message) VALUES (?)');
  insert.run(`Hello at ${new Date().toISOString()}`);

  // Fetch all rows
  const query = db.query('SELECT * FROM test');
  const results = query.all();
  
  return c.json({ success: true, data: results });
});

// 3. Serve the static frontend (dist folder)
// It serves everything from ../dist for any unmatched routes
app.use('/*', serveStatic({ root: '../dist' }));

const port = process.env.PORT || 3000;
console.log(`\n🚀 Backend Server running at http://localhost:${port}`);
console.log(`📁 Serving static files from: ../dist`);
console.log(`\nEndpoints:`);
console.log(`- http://localhost:${port}/api/health`);
console.log(`- http://localhost:${port}/api/db-test`);

export default {
  port,
  fetch: app.fetch,
};
