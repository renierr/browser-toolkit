import { Hono } from 'hono';
import * as os from 'node:os';
import { streamSSE } from 'hono/streaming';
import { getSystemMetrics } from '../lib/system-metrics';
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
system.get('/info', async (c) => {
  const metrics = await getSystemMetrics();

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
    memory: metrics.memory,
    load: os.loadavg(),
    disk: metrics.disk
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
