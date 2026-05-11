import { Hono } from 'hono';
import * as os from 'node:os';
import { streamSSE } from 'hono/streaming';
import {
  checkForUpdates,
  getUpdateJob,
  startUpdateJob,
  subscribeToUpdateJob,
  type UpdateJobEvent,
} from '../lib/update-runner';

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
    runtimeUptime: process.uptime(),
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

system.get('/update/check', (c) => {
  const result = checkForUpdates();
  if (!result.ok) {
    return c.json(result, 500);
  }
  return c.json(result);
});

system.post('/update/run', async (c) => {
  let force = false;
  try {
    const body = await c.req.json<{ force?: boolean }>();
    force = body.force === true;
  } catch (error) {
    // allow empty body
  }

  const result = startUpdateJob({
    force,
    source: 'api',
    restartOnSuccess: true,
  });

  const statusCode = result.started ? 202 : 409;
  return c.json(
    {
      started: result.started,
      message: result.message,
      jobId: result.jobId,
      job: result.job,
    },
    statusCode
  );
});

system.get('/update/job/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = getUpdateJob(jobId);
  if (!job) {
    return c.json({ error: 'Update job not found.' }, 404);
  }
  return c.json(job);
});

system.get('/update/stream/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribeToUpdateJob(jobId, (event: UpdateJobEvent) => {
      const payload = JSON.stringify(event);
      stream.writeSSE({ data: payload });
    });

    if (!unsubscribe) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'Update job not found.' }),
      });
      return;
    }

    stream.onAbort(() => {
      unsubscribe();
    });

    while (true) {
      await stream.sleep(30000);
      await stream.writeSSE({ event: 'ping', data: 'heartbeat' });
    }
  });
});

export default system;
