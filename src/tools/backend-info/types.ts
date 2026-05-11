export type BackendInfoResponse = {
  status?: string;
  appVersion?: string;
  hostname?: string;
  uptime?: number;
  runtimeUptime?: number;
  runtime?: string;
  version?: string;
  os?: string;
  arch?: string;
  time?: string;
  memory?: {
    total: number;
    free: number;
    used: number;
    percent: number;
    source?: 'cgroup-v2' | 'cgroup-v1' | 'proc-meminfo' | 'os';
  };
  disk?: {
    total: number;
    free: number;
    used: number;
    percent: number;
    source?: 'statfs';
  } | null;
  load?: number[];
  update?: {
    supported: boolean;
    mode: 'git-source' | 'packaged';
    reason?: string;
    hasGit: boolean;
    hasRepository: boolean;
    hasOrigin: boolean;
    hasBuildInputs: boolean;
  };
};

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

export type UpdateStep = {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
};

export type UpdateLogEntry = {
  at: string;
  level: 'info' | 'error';
  message: string;
};

export type UpdateJobSnapshot = {
  id: string;
  status: 'queued' | 'running' | 'no_changes' | 'completed' | 'pending_restart' | 'failed';
  force: boolean;
  check?: UpdateCheckResult;
  steps: UpdateStep[];
  logs: UpdateLogEntry[];
  error?: string;
};

export type UpdateEvent =
  | { type: 'state'; job: UpdateJobSnapshot }
  | { type: 'log'; jobId: string; entry: UpdateLogEntry };
