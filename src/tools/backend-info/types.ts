export type BackendInfoResponse = {
  status?: string;
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
    used: number;
    percent: number;
  };
  disk?: {
    total: number;
    used: number;
    percent: number;
  };
  load?: number[];
};

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
