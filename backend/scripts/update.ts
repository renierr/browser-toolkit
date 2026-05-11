import {
  checkForUpdates,
  getUpdateJob,
  startUpdateJob,
  subscribeToUpdateJob,
  type UpdateJobEvent,
} from '../lib/update-runner';

function parseArgs(args: string[]): { force: boolean; checkOnly: boolean } {
  const force = args.includes('--force');
  const checkOnly = args.includes('--check');
  return { force, checkOnly };
}

async function run(): Promise<void> {
  const { force, checkOnly } = parseArgs(process.argv.slice(2));

  if (checkOnly) {
    const check = await checkForUpdates();
    console.log(JSON.stringify(check, null, 2));
    process.exit(check.ok ? 0 : 1);
  }

  const start = startUpdateJob({
    force,
    source: 'cli',
    restartOnSuccess: false,
  });

  if (!start.started) {
    console.error(`[update] ${start.message} (jobId=${start.jobId})`);
    process.exit(1);
  }

  console.log(`[update] started job ${start.jobId}`);

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = subscribeToUpdateJob(start.jobId, (event: UpdateJobEvent) => {
      if (event.type === 'log') {
        const prefix = event.entry.level === 'error' ? 'ERR' : 'LOG';
        console.log(`[${prefix}] ${event.entry.message}`);
        return;
      }

      const status = event.job.status;
      if (status === 'failed') {
        unsubscribe?.();
        reject(new Error(event.job.error || 'Update failed.'));
        return;
      }

      if (status === 'completed' || status === 'no_changes') {
        unsubscribe?.();
        resolve();
      }
    });

    if (!unsubscribe) {
      reject(new Error('Unable to subscribe to update job.'));
    }
  });

  const result = getUpdateJob(start.jobId);
  if (!result) {
    throw new Error('Update job disappeared.');
  }

  if (result.status === 'completed') {
    console.log('[update] done');
  } else if (result.status === 'no_changes') {
    console.log('[update] no changes');
  }
}

run().catch((error) => {
  console.error('[update] failed', error);
  process.exit(1);
});
