import { Hono } from 'hono';

const system = new Hono();

// Health check endpoint
system.get('/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

// System info endpoint
system.get('/info', (c) => {
  return c.json({
    status: 'ok',
    time: new Date().toISOString(),
    runtime: 'Bun',
    version: Bun.version,
    os: process.platform,
    arch: process.arch,
  });
});

export default system;
