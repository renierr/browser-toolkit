import { Hono } from 'hono';
import * as os from 'node:os';
import { streamSSE } from 'hono/streaming';
import { getSystemMetrics } from '../lib/system-metrics';
import {
  checkForUpdates,
  getUpdateCapabilities,
  getUpdateJob,
  startUpdateJob,
  subscribeToUpdateJob,
  type UpdateJobEvent,
} from '../lib/update-runner';

declare const __APP_VERSION__: string | undefined;

const system = new Hono();
const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// Health check endpoint
system.get('/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

// System info endpoint
system.get('/info', async (c) => {
  const metrics = await getSystemMetrics();
  const update = await getUpdateCapabilities();

  return c.json({
    status: 'ok',
    time: new Date().toISOString(),
    appVersion,
    runtime: 'Bun',
    version: Bun.version,
    os: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    uptime: os.uptime(),
    runtimeUptime: process.uptime(),
    memory: metrics.memory,
    load: os.loadavg(),
    disk: metrics.disk,
    update,
  });
});

system.get('/update/check', async (c) => {
  const result = await checkForUpdates();
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
    let streamDone = false;
    let writeQueue: Promise<void> = Promise.resolve();

    const isTerminalStatus = (status: string): boolean => {
      return (
        status === 'failed' ||
        status === 'completed' ||
        status === 'no_changes' ||
        status === 'pending_restart'
      );
    };

    const enqueueWrite = (task: () => Promise<void>): Promise<void> => {
      writeQueue = writeQueue
        .then(async () => {
          if (streamDone) {
            return;
          }
          await task();
        })
        .catch(() => {
          streamDone = true;
        });
      return writeQueue;
    };

    const sendEvent = (event: UpdateJobEvent): Promise<void> => {
      return enqueueWrite(async () => {
        const payload = JSON.stringify(event);
        await stream.writeSSE({ data: payload });
        if (event.type === 'state' && isTerminalStatus(event.job.status)) {
          streamDone = true;
        }
      });
    };

    const unsubscribe = subscribeToUpdateJob(jobId, (event: UpdateJobEvent) => {
      void sendEvent(event).catch(() => {
        streamDone = true;
      });
    });

    if (!unsubscribe) {
      await enqueueWrite(async () => {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'Update job not found.' }),
        });
      });
      return;
    }

    stream.onAbort(() => {
      streamDone = true;
      unsubscribe();
    });

    try {
      while (!streamDone) {
        await stream.sleep(30000);
        if (streamDone) {
          break;
        }
        await enqueueWrite(async () => {
          await stream.writeSSE({ event: 'ping', data: 'heartbeat' });
        });
      }
    } finally {
      unsubscribe();
      await writeQueue.catch(() => undefined);
    }
  });
});

export default system;
