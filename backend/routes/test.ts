import { Hono } from 'hono';
import { db } from '../lib/db';

const test = new Hono();

// Simple SQLite example endpoint
test.get('/db-test', (c) => {
  // Insert a row
  const insert = db.query('INSERT INTO test (message) VALUES (?)');
  insert.run(`Hello at ${new Date().toISOString()}`);

  // Fetch all rows
  const query = db.query('SELECT * FROM test');
  const results = query.all();
  
  return c.json({ success: true, data: results });
});

export default test;
