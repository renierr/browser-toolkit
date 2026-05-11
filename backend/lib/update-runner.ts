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
  supported: boolean;
  mode: 'git-source' | 'packaged';
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

export type UpdateCapabilities = {
  supported: boolean;
  mode: 'git-source' | 'packaged';
  reason?: string;
  hasGit: boolean;
  hasRepository: boolean;
  hasOrigin: boolean;
  hasBuildInputs: boolean;
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

function hasBuildInputs(appDir: string): boolean {
  return (
    existsSync(resolve(appDir, 'src')) &&
    existsSync(resolve(appDir, 'package.json')) &&
    existsSync(resolve(appDir, 'backend', 'package.json'))
  );
}

export async function getUpdateCapabilities(): Promise<UpdateCapabilities> {
  const backendDir = backendDirFromRuntime();
  const appDir = appDirFromBackendDir(backendDir);
  const repositoryMarker = resolve(appDir, '.git');
  const hasRepository = existsSync(repositoryMarker);
  const buildInputs = hasBuildInputs(appDir);

  const gitVersionResult = await runCommand(['git', '--version'], appDir);
  const hasGit = gitVersionResult.success;

  let hasOrigin = false;
  if (hasGit && hasRepository) {
    const originResult = await runCommand(['git', 'remote', 'get-url', 'origin'], appDir);
    hasOrigin = originResult.success && originResult.stdout.length > 0;
  }

  const supported = hasGit && hasRepository && hasOrigin && buildInputs;
  let reason: string | undefined;

  if (!hasGit) {
    reason = 'Git not available in runtime environment. Manual release update required.';
  } else if (!hasRepository) {
    reason = 'No git repository detected. Running packaged release without source checkout.';
  } else if (!hasOrigin) {
    reason = 'Git remote origin missing. Automatic update requires origin tracking.';
  } else if (!buildInputs) {
    reason = 'Build source files missing. Automatic rebuild not possible in packaged release.';
  }

  return {
    supported,
    mode: supported ? 'git-source' : 'packaged',
    reason,
    hasGit,
    hasRepository,
    hasOrigin,
    hasBuildInputs: buildInputs,
  };
}

function commandText(parts: string[]): string {
  return parts.map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ');
}

const DEFAULT_STEP_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_STEP_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const COMMAND_CHECK_TIMEOUT_MS = 2 * 60 * 1000;

async function runCommand(command: string[], cwd: string, timeoutMs = COMMAND_CHECK_TIMEOUT_MS): Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  let exitCode: number;
  try {
    exitCode = await waitForProcessExit(proc, command[0] ?? 'command', {
      timeoutMs,
    });
  } catch (error) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // no-op
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (proc.exitCode === null) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // no-op
      }
    }
    throw error;
  }

  const [stdoutText, stderrText] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(''),
    proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(''),
  ]);

  return {
    success: exitCode === 0,
    stdout: stdoutText.trim(),
    stderr: stderrText.trim(),
    exitCode,
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
  idleTimeoutMs?: number;
};

function formatTimeout(timeoutMs: number): string {
  if (timeoutMs < 1000) {
    return `${timeoutMs}ms`;
  }
  const sec = Math.round(timeoutMs / 1000);
  return `${sec}s`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const sec = Math.round(ms / 1000);
  return `${sec}s`;
}

async function waitForProcessExit(
  proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  stepName: string,
  options: RunStepOptions = {},
  getLastOutputAt?: () => number
): Promise<number> {
  const startedAt = Date.now();

  while (true) {
    const raceResult = await Promise.race<
      | { type: 'exited'; exitCode: number }
      | { type: 'tick' }
    >([
      proc.exited.then((exitCode) => ({ type: 'exited', exitCode } as const)),
      new Promise<{ type: 'tick' }>((resolve) => {
        setTimeout(() => resolve({ type: 'tick' }), 1000);
      }),
    ]);

    if (raceResult.type === 'exited') {
      return raceResult.exitCode;
    }

    const now = Date.now();

    if (options.timeoutMs && options.timeoutMs > 0 && now - startedAt > options.timeoutMs) {
      throw new Error(`[${stepName}] command timed out after ${formatTimeout(options.timeoutMs)}`);
    }

    if (options.idleTimeoutMs && options.idleTimeoutMs > 0 && getLastOutputAt) {
      const idleMs = now - getLastOutputAt();
      if (idleMs > options.idleTimeoutMs) {
        throw new Error(
          `[${stepName}] command produced no output for ${formatTimeout(options.idleTimeoutMs)}`
        );
      }
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_STEP_IDLE_TIMEOUT_MS;

  setStepStatus(job, stepName, 'running');
  emitLog(job, 'info', `[${stepName}] $ ${commandText(command)} (cwd: ${cwd})`);

  const proc = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  const startedAt = Date.now();
  let lastOutputAt = startedAt;

  const onStdoutLine = (line: string): void => {
    lastOutputAt = Date.now();
    emitLog(job, 'info', `[${stepName}] ${line}`);
  };

  const onStderrLine = (line: string): void => {
    lastOutputAt = Date.now();
    emitLog(job, 'error', `[${stepName}] ${line}`);
  };

  const stdoutReader = readStreamLines(proc.stdout, onStdoutLine);
  const stderrReader = readStreamLines(proc.stderr, onStderrLine);

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    const idleMs = now - lastOutputAt;
    if (idleMs < 30000) {
      return;
    }
    emitLog(
      job,
      'info',
      `[${stepName}] still running (${formatDuration(now - startedAt)} elapsed, idle ${formatDuration(idleMs)})`
    );
  }, 30000);

  let exitCode: number;
  try {
    exitCode = await waitForProcessExit(
      proc,
      stepName,
      {
        timeoutMs,
        idleTimeoutMs,
      },
      () => lastOutputAt
    );
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
    clearInterval(heartbeatTimer);
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

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const backendDir = backendDirFromRuntime();
  const appDir = appDirFromBackendDir(backendDir);
  const capabilities = await getUpdateCapabilities();

  if (!capabilities.supported) {
    return {
      ok: true,
      supported: false,
      mode: capabilities.mode,
      branch: 'n/a',
      localHash: '',
      remoteHash: '',
      behindCount: 0,
      hasUpdates: false,
      checkedAt: nowIso(),
      message: capabilities.reason || 'Automatic update is unavailable in this deployment mode.',
    };
  }

  const branchResult = await runCommand(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], appDir);
  if (!branchResult.success || branchResult.stdout.length === 0) {
    return {
      ok: false,
      supported: true,
      mode: 'git-source',
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
  const fetchResult = await runCommand(['git', 'fetch', '--prune', 'origin'], appDir);
  if (!fetchResult.success) {
    return {
      ok: false,
      supported: true,
      mode: 'git-source',
      branch,
      localHash: '',
      remoteHash: '',
      behindCount: 0,
      hasUpdates: false,
      checkedAt: nowIso(),
      message: fetchResult.stderr || 'git fetch failed.',
    };
  }

  const [localHashResult, remoteHashResult, behindResult] = await Promise.all([
    runCommand(['git', 'rev-parse', 'HEAD'], appDir),
    runCommand(['git', 'rev-parse', `origin/${branch}`], appDir),
    runCommand(['git', 'rev-list', '--count', `HEAD..origin/${branch}`], appDir),
  ]);

  if (!localHashResult.success || !remoteHashResult.success || !behindResult.success) {
    return {
      ok: false,
      supported: true,
      mode: 'git-source',
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
    supported: true,
    mode: 'git-source',
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
    const check = await checkForUpdates();
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
  const backendDir = backendDirFromRuntime();
  const appDir = appDirFromBackendDir(backendDir);
  if (!existsSync(resolve(appDir, '.git')) || !hasBuildInputs(appDir)) {
    return {
      started: false,
      jobId: '',
      job: {
        id: '',
        status: 'failed',
        source: options.source,
        force: options.force,
        restartOnSuccess: options.restartOnSuccess,
        createdAt: nowIso(),
        appDir,
        backendDir,
        steps: [],
        logs: [],
        error: 'Automatic update unavailable in packaged release mode.',
      },
      message: 'Automatic update unavailable in packaged release mode. Install new release manually.',
    };
  }

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
