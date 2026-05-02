import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';

// Ensure data directory exists
mkdirSync('./data', { recursive: true });

// Setup a simple SQLite Database
export const db = new Database('./data/mydb.sqlite', { create: true });

// Initialize tables
db.query('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, message TEXT)').run();
