import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export type UpdateJobStatus =
  | 'queued'
  | 'running'
  | 'no_changes'
  | 'completed'
  | 'pending_restart'
  | 'failed';

export type UpdateCheckResult = {
  ok: boolean;
  branch: string;
  localHash: string;
  remoteHash: string;
  behindCount: number;
  hasUpdates: boolean;
  checkedAt: string;
  message?: string;
};

export type UpdateLogEntry = {
  at: string;
  level: 'info' | 'error';
  message: string;
};

export type UpdateStep = {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
};

export type UpdateJobSnapshot = {
  id: string;
  status: UpdateJobStatus;
  source: 'api' | 'cli';
  force: boolean;
  restartOnSuccess: boolean;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  appDir: string;
  backendDir: string;
  check?: UpdateCheckResult;
  steps: UpdateStep[];
  logs: UpdateLogEntry[];
  error?: string;
};

export type UpdateJobEvent =
  | { type: 'state'; job: UpdateJobSnapshot }
  | { type: 'log'; jobId: string; entry: UpdateLogEntry };

type UpdateJobOptions = {
  force: boolean;
  source: 'api' | 'cli';
  restartOnSuccess: boolean;
};

type UpdateJobInternal = UpdateJobSnapshot & {
  subscribers: Set<(event: UpdateJobEvent) => void>;
};

const jobs = new Map<string, UpdateJobInternal>();
let runningJobId: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function appDirFromBackendDir(backendDir: string): string {
  return resolve(backendDir, '..');
}

function backendDirFromRuntime(): string {
  return process.cwd();
}

function commandText(parts: string[]): string {
  return parts.map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ');
}

function runCommandSync(command: string[], cwd: string): {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const proc = Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
  return {
    success: proc.success,
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
    exitCode: proc.exitCode,
  };
}

function toSnapshot(job: UpdateJobInternal): UpdateJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    source: job.source,
    force: job.force,
    restartOnSuccess: job.restartOnSuccess,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    appDir: job.appDir,
    backendDir: job.backendDir,
    check: job.check,
    steps: job.steps.map((step) => ({ ...step })),
    logs: [...job.logs],
    error: job.error,
  };
}

function emitState(job: UpdateJobInternal): void {
  const event: UpdateJobEvent = { type: 'state', job: toSnapshot(job) };
  for (const send of job.subscribers) {
    send(event);
  }
}

function emitLog(job: UpdateJobInternal, level: 'info' | 'error', message: string): void {
  const entry: UpdateLogEntry = { at: nowIso(), level, message };
  job.logs.push(entry);
  const event: UpdateJobEvent = { type: 'log', jobId: job.id, entry };
  for (const send of job.subscribers) {
    send(event);
  }
}

function setStepStatus(
  job: UpdateJobInternal,
  stepName: string,
  status: UpdateStep['status'],
  exitCode?: number
): void {
  const step = job.steps.find((item) => item.name === stepName);
  if (!step) {
    return;
  }
  if (status === 'running') {
    step.startedAt = nowIso();
  }
  if (status === 'completed' || status === 'failed' || status === 'skipped') {
    step.endedAt = nowIso();
  }
  if (exitCode !== undefined) {
    step.exitCode = exitCode;
  }
  step.status = status;
  emitState(job);
}

function createJob(options: UpdateJobOptions): UpdateJobInternal {
  const backendDir = backendDirFromRuntime();
  const appDir = appDirFromBackendDir(backendDir);
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

  return {
    id,
    status: 'queued',
    source: options.source,
    force: options.force,
    restartOnSuccess: options.restartOnSuccess,
    createdAt: nowIso(),
    appDir,
    backendDir,
    steps: [
      { name: 'git-fetch', status: 'pending' },
      { name: 'git-pull', status: 'pending' },
      { name: 'install-root', status: 'pending' },
      { name: 'build-frontend', status: 'pending' },
      { name: 'install-backend', status: 'pending' },
    ],
    logs: [],
    subscribers: new Set(),
  };
}

async function readStreamLines(
  stream: ReadableStream<Uint8Array> | null,
  onLine: (line: string) => void
): Promise<void> {
  if (!stream) {
    return;
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\n|\r/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length > 0) {
          onLine(line);
        }
      }
    }
    const tail = decoder.decode();
    if (tail.length > 0) {
      buffer += tail;
    }
    if (buffer.trim().length > 0) {
      onLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

type RunStepOptions = {
  timeoutMs?: number;
};

function formatTimeout(timeoutMs: number): string {
  if (timeoutMs < 1000) {
    return `${timeoutMs}ms`;
  }
  const sec = Math.round(timeoutMs / 1000);
  return `${sec}s`;
}

async function waitForProcessExit(
  proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  stepName: string,
  timeoutMs?: number
): Promise<number> {
  if (!timeoutMs || timeoutMs <= 0) {
    return proc.exited;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<number>([
      proc.exited,
      new Promise<number>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`[${stepName}] command timed out after ${formatTimeout(timeoutMs)}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runStepCommand(
  job: UpdateJobInternal,
  stepName: string,
  command: string[],
  cwd: string,
  options: RunStepOptions = {}
): Promise<void> {
  setStepStatus(job, stepName, 'running');
  emitLog(job, 'info', `[${stepName}] $ ${commandText(command)} (cwd: ${cwd})`);

  const proc = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  const stdoutReader = readStreamLines(proc.stdout, (line) => emitLog(job, 'info', `[${stepName}] ${line}`));
  const stderrReader = readStreamLines(proc.stderr, (line) => emitLog(job, 'error', `[${stepName}] ${line}`));

  let exitCode: number;
  try {
    exitCode = await waitForProcessExit(proc, stepName, options.timeoutMs);
  } catch (error) {
    const timeoutMessage = error instanceof Error ? error.message : String(error);
    emitLog(job, 'error', timeoutMessage);
    try {
      proc.kill('SIGTERM');
    } catch {
      // no-op
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (proc.exitCode === null) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // no-op
      }
    }
    const forcedExitCode = await Promise.race<number>([
      proc.exited,
      new Promise<number>((resolve) => setTimeout(() => resolve(-1), 2000)),
    ]);
    setStepStatus(job, stepName, 'failed', forcedExitCode);
    throw error;
  } finally {
    await Promise.allSettled([proc.stdout?.cancel(), proc.stderr?.cancel()]);
    await Promise.allSettled([stdoutReader, stderrReader]);
  }

  if (exitCode !== 0) {
    setStepStatus(job, stepName, 'failed', exitCode);
    throw new Error(`[${stepName}] command failed with exit code ${exitCode}`);
  }

  setStepStatus(job, stepName, 'completed', exitCode);
}

async function swapDistDirectories(appDir: string): Promise<void> {
  const distDir = resolve(appDir, 'dist');
  const distNextDir = resolve(appDir, 'dist_next');
  const distPrevDir = resolve(appDir, 'dist_prev');

  if (!existsSync(distNextDir)) {
    throw new Error('dist_next missing after build');
  }

  await rm(distPrevDir, { recursive: true, force: true });

  if (existsSync(distDir)) {
    await rename(distDir, distPrevDir);
  }

  await rename(distNextDir, distDir);
  await rm(distPrevDir, { recursive: true, force: true });
}

export function checkForUpdates(): UpdateCheckResult {
  const backendDir = backendDirFromRuntime();
  const appDir = appDirFromBackendDir(backendDir);

  const branchResult = runCommandSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], appDir);
  if (!branchResult.success || branchResult.stdout.length === 0) {
    return {
      ok: false,
      branch: 'unknown',
      localHash: '',
      remoteHash: '',
      behindCount: 0,
      hasUpdates: false,
      checkedAt: nowIso(),
      message: branchResult.stderr || 'Unable to detect current git branch.',
    };
  }

  const branch = branchResult.stdout;
  const fetchResult = runCommandSync(['git', 'fetch', '--prune', 'origin'], appDir);
  if (!fetchResult.success) {
    return {
      ok: false,
      branch,
      localHash: '',
      remoteHash: '',
      behindCount: 0,
      hasUpdates: false,
      checkedAt: nowIso(),
      message: fetchResult.stderr || 'git fetch failed.',
    };
  }

  const localHashResult = runCommandSync(['git', 'rev-parse', 'HEAD'], appDir);
  const remoteHashResult = runCommandSync(['git', 'rev-parse', `origin/${branch}`], appDir);
  const behindResult = runCommandSync(['git', 'rev-list', '--count', `HEAD..origin/${branch}`], appDir);

  if (!localHashResult.success || !remoteHashResult.success || !behindResult.success) {
    return {
      ok: false,
      branch,
      localHash: localHashResult.stdout,
      remoteHash: remoteHashResult.stdout,
      behindCount: 0,
      hasUpdates: false,
      checkedAt: nowIso(),
      message:
        localHashResult.stderr ||
        remoteHashResult.stderr ||
        behindResult.stderr ||
        'Unable to compare local and remote commits.',
    };
  }

  const behindCount = Number.parseInt(behindResult.stdout, 10) || 0;
  return {
    ok: true,
    branch,
    localHash: localHashResult.stdout,
    remoteHash: remoteHashResult.stdout,
    behindCount,
    hasUpdates: behindCount > 0,
    checkedAt: nowIso(),
  };
}

async function executeJob(job: UpdateJobInternal): Promise<void> {
  job.status = 'running';
  job.startedAt = nowIso();
  emitState(job);

  try {
    const check = checkForUpdates();
    job.check = check;
    emitState(job);

    if (!check.ok) {
      throw new Error(check.message || 'Update check failed.');
    }

    if (!job.force && !check.hasUpdates) {
      setStepStatus(job, 'git-fetch', 'completed', 0);
      setStepStatus(job, 'git-pull', 'skipped', 0);
      setStepStatus(job, 'install-root', 'skipped', 0);
      setStepStatus(job, 'build-frontend', 'skipped', 0);
      setStepStatus(job, 'install-backend', 'skipped', 0);
      job.status = 'no_changes';
      job.endedAt = nowIso();
      emitLog(job, 'info', 'No remote updates found. Skipping build steps.');
      emitState(job);
      return;
    }

    setStepStatus(job, 'git-fetch', 'completed', 0);
    await runStepCommand(job, 'git-pull', ['git', 'pull', '--ff-only', 'origin', check.branch], job.appDir);
    await runStepCommand(job, 'install-root', ['bun', 'install'], job.appDir);

    await rm(resolve(job.appDir, 'dist_next'), { recursive: true, force: true });
    await runStepCommand(
      job,
      'build-frontend',
      ['bun', 'x', 'vite', 'build', '--outDir', 'dist_next'],
      job.appDir,
      { timeoutMs: 10 * 60 * 1000 }
    );
    emitLog(job, 'info', '[build-frontend] Swapping dist directories');
    await swapDistDirectories(job.appDir);

    await runStepCommand(job, 'install-backend', ['bun', 'install', '--cwd', 'backend'], job.appDir);

    if (job.restartOnSuccess) {
      job.status = 'pending_restart';
      job.endedAt = nowIso();
      emitLog(job, 'info', 'Update complete. Triggering process exit for systemd restart.');
      emitState(job);
      setTimeout(() => {
        process.exit(0);
      }, 1500);
      return;
    }

    job.status = 'completed';
    job.endedAt = nowIso();
    emitLog(job, 'info', 'Update complete.');
    emitState(job);
  } catch (error) {
    job.status = 'failed';
    job.endedAt = nowIso();
    job.error = error instanceof Error ? error.message : String(error);
    emitLog(job, 'error', job.error);
    emitState(job);
  } finally {
    runningJobId = null;
  }
}

export function startUpdateJob(options: UpdateJobOptions): {
  started: boolean;
  jobId: string;
  job: UpdateJobSnapshot;
  message: string;
} {
  if (runningJobId) {
    const existing = jobs.get(runningJobId);
    if (existing) {
      return {
        started: false,
        jobId: existing.id,
        job: toSnapshot(existing),
        message: 'An update job is already running.',
      };
    }
    runningJobId = null;
  }

  const job = createJob(options);
  jobs.set(job.id, job);
  runningJobId = job.id;
  queueMicrotask(() => {
    void executeJob(job);
  });

  return {
    started: true,
    jobId: job.id,
    job: toSnapshot(job),
    message: 'Update job started.',
  };
}

export function getUpdateJob(jobId: string): UpdateJobSnapshot | null {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }
  return toSnapshot(job);
}

export function subscribeToUpdateJob(
  jobId: string,
  callback: (event: UpdateJobEvent) => void
): (() => void) | null {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }

  job.subscribers.add(callback);
  callback({ type: 'state', job: toSnapshot(job) });
  return () => {
    job.subscribers.delete(callback);
  };
}
