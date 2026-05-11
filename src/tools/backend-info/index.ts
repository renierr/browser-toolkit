import { fetchApi, fetchJson } from '../../js/api';
import { showMessage } from '../../js/ui';

type BackendInfoResponse = {
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

type UpdateCheckResult = {
  ok: boolean;
  branch: string;
  localHash: string;
  remoteHash: string;
  behindCount: number;
  hasUpdates: boolean;
  checkedAt: string;
  message?: string;
};

type UpdateStep = {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
};

type UpdateLogEntry = {
  at: string;
  level: 'info' | 'error';
  message: string;
};

type UpdateJobSnapshot = {
  id: string;
  status: 'queued' | 'running' | 'no_changes' | 'completed' | 'pending_restart' | 'failed';
  force: boolean;
  check?: UpdateCheckResult;
  steps: UpdateStep[];
  logs: UpdateLogEntry[];
  error?: string;
};

type UpdateEvent =
  | { type: 'state'; job: UpdateJobSnapshot }
  | { type: 'log'; jobId: string; entry: UpdateLogEntry };

export default function init(): void | (() => void) {
  const container = document.getElementById('backend-info-tool');
  if (!container) return;

  const loadingEl = container.querySelector('#info-loading') as HTMLElement;
  const errorEl = container.querySelector('#info-error') as HTMLElement;
  const contentEl = container.querySelector('#info-content') as HTMLElement;
  const refreshBtn = container.querySelector('#refresh-btn') as HTMLButtonElement;
  const checkUpdateBtn = container.querySelector('#check-update-btn') as HTMLButtonElement;
  const runUpdateBtn = container.querySelector('#run-update-btn') as HTMLButtonElement;
  const forceToggle = container.querySelector('#force-update-toggle') as HTMLInputElement;
  const updateStateEl = container.querySelector('#upd-state') as HTMLElement;
  const updateMessageEl = container.querySelector('#upd-message') as HTMLElement;
  const updateLogsEl = container.querySelector('#upd-logs') as HTMLElement;

  let updateStreamController: AbortController | null = null;
  let renderedLogCount = 0;
  let notifiedTerminalStatus: UpdateJobSnapshot['status'] | null = null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
  };

  const updateUI = (data: BackendInfoResponse) => {
    const setText = (id: string, text: string) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };

    const setProgress = (id: string, value: number) => {
      const el = container.querySelector(`#${id}`) as HTMLProgressElement;
      if (el) el.value = value;
    };

    setText('val-status', data.status ? data.status.toUpperCase() : 'UNKNOWN');
    setText('val-hostname', data.hostname || 'unknown-host');
    setText('val-uptime', data.uptime !== undefined ? formatUptime(data.uptime) : '-');
    setText(
      'val-runtime-uptime',
      data.runtimeUptime !== undefined ? formatUptime(data.runtimeUptime) : '-'
    );
    setText('val-runtime', data.runtime || '-');
    setText('val-version', data.version ? `v${data.version}` : '');
    setText('val-os', data.os || '-');
    setText('val-arch', data.arch || '-');
    setText('val-time', data.time ? new Date(data.time).toLocaleTimeString() : '-');

    if (data.memory) {
      setText(
        'val-mem-text',
        `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`
      );
      setText('val-mem-percent', `${data.memory.percent}%`);
      setProgress('val-mem-progress', data.memory.percent);
    }

    if (data.disk) {
      setText('val-disk-text', `${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)}`);
      setText('val-disk-percent', `${data.disk.percent}%`);
      setProgress('val-disk-progress', data.disk.percent);
    }

    if (data.load) {
      setText('val-load', data.load.map((l: number) => l.toFixed(2)).join(' / '));
    }
  };

  const setUpdateSummary = (message: string) => {
    if (updateMessageEl) {
      updateMessageEl.textContent = message;
    }
  };

  const appendUpdateLog = (line: string) => {
    if (!updateLogsEl) return;
    const entry = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = line;
    entry.appendChild(code);
    updateLogsEl.appendChild(entry);
    updateLogsEl.scrollTop = updateLogsEl.scrollHeight;
  };

  const clearUpdateLogs = () => {
    if (!updateLogsEl) return;
    updateLogsEl.innerHTML = '';
    renderedLogCount = 0;
    notifiedTerminalStatus = null;
  };

  const renderMissingJobLogs = (job: UpdateJobSnapshot) => {
    if (job.logs.length <= renderedLogCount) {
      return;
    }
    const missing = job.logs.slice(renderedLogCount);
    for (const entry of missing) {
      appendUpdateLog(entry.message);
    }
    renderedLogCount = job.logs.length;
  };

  const shortHash = (hash: string | undefined) => {
    if (!hash) return '-';
    return hash.slice(0, 8);
  };

  const setText = (id: string, text: string) => {
    const el = container.querySelector(`#${id}`);
    if (el) el.textContent = text;
  };

  const setUpdateBusy = (busy: boolean) => {
    if (checkUpdateBtn) checkUpdateBtn.disabled = busy;
    if (runUpdateBtn) runUpdateBtn.disabled = busy;
    if (forceToggle) forceToggle.disabled = busy;
  };

  const renderUpdateCheck = (result: UpdateCheckResult) => {
    setText('upd-branch', result.branch || '-');
    setText('upd-local', shortHash(result.localHash));
    setText('upd-remote', shortHash(result.remoteHash));

    if (result.ok) {
      const summary = result.hasUpdates
        ? `Updates available (${result.behindCount} commit${result.behindCount === 1 ? '' : 's'} behind).`
        : 'Already up to date.';
      setUpdateSummary(summary);
    } else {
      setUpdateSummary(result.message || 'Failed to check updates.');
    }
  };

  const renderJobState = (job: UpdateJobSnapshot) => {
    renderMissingJobLogs(job);

    if (updateStateEl) {
      updateStateEl.textContent = job.status;
    }
    if (job.check) {
      renderUpdateCheck(job.check);
    }
    if (job.status === 'failed') {
      setUpdateSummary(job.error || 'Update failed.');
      setUpdateBusy(false);
      if (notifiedTerminalStatus !== 'failed') {
        showMessage(job.error || 'Update failed.', { type: 'alert', timeoutMs: 4000 });
      }
    }
    if (job.status === 'completed' || job.status === 'no_changes') {
      setUpdateBusy(false);
      if (job.status === 'no_changes') {
        setUpdateSummary('No changes detected. Build skipped.');
      }
      if (notifiedTerminalStatus !== job.status) {
        const doneMessage =
          job.status === 'no_changes'
            ? 'No changes detected. Server already up to date.'
            : 'Update completed successfully.';
        showMessage(doneMessage, { type: 'info', timeoutMs: 4000 });
      }
    }
    if (job.status === 'pending_restart') {
      setUpdateSummary('Update complete. Server will restart via systemd.');
      setUpdateBusy(true);
      if (notifiedTerminalStatus !== 'pending_restart') {
        showMessage('Update complete. Restarting service via systemd.', {
          type: 'info',
          timeoutMs: 4000,
        });
      }
    }

    if (job.status === 'failed' || job.status === 'completed' || job.status === 'no_changes' || job.status === 'pending_restart') {
      notifiedTerminalStatus = job.status;
    }
  };

  const connectUpdateStream = async (jobId: string) => {
    if (updateStreamController) {
      updateStreamController.abort();
    }
    updateStreamController = new AbortController();
    const controller = updateStreamController;

    try {
      const response = await fetchApi(`/update/stream/${jobId}`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!response.body) {
        throw new Error('SSE stream missing response body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
          if (dataLines.length === 0) continue;

          const dataText = dataLines.join('\n');
          try {
            const event = JSON.parse(dataText) as UpdateEvent;
            if (event.type === 'log') {
              appendUpdateLog(event.entry.message);
              renderedLogCount += 1;
            }
            if (event.type === 'state') {
              renderJobState(event.job);
              if (
                event.job.status === 'failed' ||
                event.job.status === 'completed' ||
                event.job.status === 'no_changes' ||
                event.job.status === 'pending_restart'
              ) {
                return;
              }
            }
          } catch (error) {
            appendUpdateLog(`[client] failed to parse event: ${dataText}`);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('[BackendInfo] Update SSE failed:', error);
        setUpdateSummary('Lost connection to update stream.');
        setUpdateBusy(false);
      }
    }
  };

  const checkUpdates = async (silent = false) => {
    setUpdateBusy(true);
    try {
      const result = await fetchJson<UpdateCheckResult>('/update/check');
      renderUpdateCheck(result);
      if (!silent) {
        const message = result.hasUpdates
          ? `Update available: ${result.behindCount} commit${result.behindCount === 1 ? '' : 's'} behind.`
          : 'Already up to date.';
        showMessage(message, { type: 'info', timeoutMs: 4000 });
      }
      if (updateStateEl) {
        updateStateEl.textContent = 'idle';
      }
    } catch (error) {
      console.error('[BackendInfo] Failed to check updates:', error);
      setUpdateSummary((error as Error).message || 'Failed to check updates.');
      showMessage((error as Error).message || 'Failed to check updates.', {
        type: 'alert',
        timeoutMs: 4000,
      });
    } finally {
      setUpdateBusy(false);
    }
  };

  const runUpdate = async () => {
    const force = forceToggle?.checked === true;
    const confirmText = force
      ? 'Run forced update now? This will pull/build even if no git changes.'
      : 'Run update now? Server will restart automatically after success.';
    if (!window.confirm(confirmText)) {
      return;
    }

    clearUpdateLogs();
    appendUpdateLog('[client] starting update job...');
    setUpdateBusy(true);
    if (updateStateEl) {
      updateStateEl.textContent = 'starting';
    }

    try {
      const payload = { force };
      const result = await fetchJson<{
        started: boolean;
        message: string;
        jobId: string;
        job: UpdateJobSnapshot;
      }>('/update/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      appendUpdateLog(`[server] ${result.message}`);
      renderJobState(result.job);
      showMessage(result.message, { type: 'info', timeoutMs: 4000 });

      if (!result.started) {
        setUpdateBusy(false);
        return;
      }

      void connectUpdateStream(result.jobId);
    } catch (error) {
      console.error('[BackendInfo] Failed to start update:', error);
      appendUpdateLog(`[client] ${(error as Error).message || 'Failed to start update job.'}`);
      setUpdateSummary('Failed to start update job.');
      showMessage((error as Error).message || 'Failed to start update job.', {
        type: 'alert',
        timeoutMs: 4000,
      });
      setUpdateBusy(false);
    }
  };

  const fetchInfo = async () => {
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const data = await fetchJson<BackendInfoResponse>('/info');
      updateUI(data);
      contentEl.classList.remove('hidden');
    } catch (err) {
      console.error('[BackendInfo] Failed to fetch info:', err);
      errorEl.classList.remove('hidden');
    } finally {
      loadingEl.classList.add('hidden');
      if (refreshBtn) refreshBtn.disabled = false;
    }
  };

  const onRefresh = () => {
    fetchInfo();
  };

  if (refreshBtn) {
    refreshBtn.addEventListener('click', onRefresh);
  }

  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', () => {
      void checkUpdates();
    });
  }

  if (runUpdateBtn) {
    runUpdateBtn.addEventListener('click', () => {
      void runUpdate();
    });
  }

  // Initial fetch
  fetchInfo();
  void checkUpdates(true);

  return () => {
    if (refreshBtn) {
      refreshBtn.removeEventListener('click', onRefresh);
    }
    if (updateStreamController) {
      updateStreamController.abort();
      updateStreamController = null;
    }
  };
}
