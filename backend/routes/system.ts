import { Hono } from 'hono';
import * as os from 'node:os';

const system = new Hono();

// Health check endpoint
system.get('/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

// System info endpoint
system.get('/info', (c) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

  let diskInfo = { total: 0, used: 0, free: 0, percent: 0 };
  try {
    // df -B1 / gives sizes in bytes for the root partition
    const proc = Bun.spawnSync(['df', '-B1', '/']);
    if (proc.success) {
      const output = proc.stdout.toString().split('\n')[1]?.trim().split(/\s+/);
      if (output && output.length >= 5) {
        diskInfo = {
          total: parseInt(output[1]),
          used: parseInt(output[2]),
          free: parseInt(output[3]),
          percent: parseInt(output[4].replace('%', ''))
        };
      }
    }
  } catch (e) {
    console.error('[BackendInfo] Failed to get disk info:', e);
  }

  return c.json({
    status: 'ok',
    time: new Date().toISOString(),
    runtime: 'Bun',
    version: Bun.version,
    os: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    uptime: os.uptime(),
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percent: Math.round(memPercent)
    },
    load: os.loadavg(),
    disk: diskInfo
  });
});

export default system;
