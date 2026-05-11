import type { BackendInfoDom } from './dom';
import { renderAnsiLogLine } from './ansi';
import { formatBytes, formatUptime, shortHash } from './format';
import type { BackendInfoResponse, UpdateCheckResult, UpdateJobSnapshot } from './types';

type RendererState = {
  renderedLogCount: number;
  notifiedTerminalStatus: UpdateJobSnapshot['status'] | null;
};

function setText(container: HTMLElement, id: string, text: string): void {
  const el = container.querySelector(`#${id}`);
  if (el) {
    el.textContent = text;
  }
}

function setProgress(container: HTMLElement, id: string, value: number): void {
  const el = container.querySelector(`#${id}`) as HTMLProgressElement | null;
  if (el) {
    el.value = value;
  }
}

export function createRenderer(dom: BackendInfoDom) {
  const state: RendererState = {
    renderedLogCount: 0,
    notifiedTerminalStatus: null,
  };

  const setUpdateSummary = (message: string): void => {
    dom.updateMessageEl.textContent = message;
  };

  const setUpdateBusy = (busy: boolean): void => {
    dom.checkUpdateBtn.disabled = busy;
    dom.runUpdateBtn.disabled = busy;
    dom.forceToggle.disabled = busy;
  };

  const setUpdateSupported = (supported: boolean, reason?: string): void => {
    dom.checkUpdateBtn.disabled = !supported;
    dom.runUpdateBtn.disabled = !supported;
    dom.forceToggle.disabled = !supported;
    if (!supported) {
      dom.updateStateEl.textContent = 'unsupported';
      dom.updateControlWrapEl.classList.add('opacity-60');
      setText(dom.container, 'upd-branch', 'n/a');
      setText(dom.container, 'upd-local', '-');
      setText(dom.container, 'upd-remote', '-');
      setUpdateSummary(reason || 'Automatic update unavailable in packaged release mode.');
      return;
    }
    dom.updateControlWrapEl.classList.remove('opacity-60');
  };

  const appendUpdateLog = (line: string): void => {
    const entry = document.createElement('pre');
    const code = document.createElement('code');
    code.appendChild(renderAnsiLogLine(line));
    entry.appendChild(code);
    dom.updateLogsEl.appendChild(entry);
    dom.updateLogsEl.scrollTop = dom.updateLogsEl.scrollHeight;
  };

  const clearUpdateLogs = (): void => {
    dom.updateLogsEl.innerHTML = '';
    state.renderedLogCount = 0;
    state.notifiedTerminalStatus = null;
  };

  const recordRenderedLog = (): void => {
    state.renderedLogCount += 1;
  };

  const renderMissingJobLogs = (job: UpdateJobSnapshot): void => {
    if (job.logs.length <= state.renderedLogCount) {
      return;
    }
    const missing = job.logs.slice(state.renderedLogCount);
    for (const entry of missing) {
      appendUpdateLog(entry.message);
    }
    state.renderedLogCount = job.logs.length;
  };

  const renderInfo = (data: BackendInfoResponse): void => {
    setText(dom.container, 'val-status', data.status ? data.status.toUpperCase() : 'UNKNOWN');
    setText(dom.container, 'val-hostname', data.hostname || 'unknown-host');
    setText(
      dom.container,
      'val-uptime',
      data.uptime !== undefined ? formatUptime(data.uptime) : '-'
    );
    setText(
      dom.container,
      'val-runtime-uptime',
      data.runtimeUptime !== undefined ? formatUptime(data.runtimeUptime) : '-'
    );
    setText(dom.container, 'val-runtime', data.runtime || '-');
    const versionParts = [
      data.appVersion ? `app ${data.appVersion}` : '',
      data.version ? `bun ${data.version}` : '',
    ].filter(Boolean);
    setText(
      dom.container,
      'val-version',
      versionParts.length > 0 ? `(${versionParts.join(' / ')})` : ''
    );
    setText(dom.container, 'val-os', data.os || '-');
    setText(dom.container, 'val-arch', data.arch || '-');
    setText(dom.container, 'val-time', data.time ? new Date(data.time).toLocaleTimeString() : '-');

    if (data.memory) {
      setText(
        dom.container,
        'val-mem-text',
        `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`
      );
      setText(
        dom.container,
        'val-mem-source',
        data.memory.source ? `Source: ${data.memory.source}` : ''
      );
      setText(dom.container, 'val-mem-percent', `${data.memory.percent}%`);
      setProgress(dom.container, 'val-mem-progress', data.memory.percent);
    }

    if (data.disk) {
      setText(
        dom.container,
        'val-disk-text',
        `${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)}`
      );
      setText(
        dom.container,
        'val-disk-source',
        data.disk.source ? `Source: ${data.disk.source}` : ''
      );
      setText(dom.container, 'val-disk-percent', `${data.disk.percent}%`);
      setProgress(dom.container, 'val-disk-progress', data.disk.percent);
    } else {
      setText(dom.container, 'val-disk-text', 'Unavailable');
      setText(dom.container, 'val-disk-source', 'Source: unavailable');
      setText(dom.container, 'val-disk-percent', '-');
      setProgress(dom.container, 'val-disk-progress', 0);
    }

    if (data.load) {
      setText(dom.container, 'val-load', data.load.map((l) => l.toFixed(2)).join(' / '));
    }

    if (data.update) {
      setUpdateSupported(data.update.supported, data.update.reason);
    }
  };

  const renderUpdateCheck = (result: UpdateCheckResult): void => {
    if (!result.supported) {
      setUpdateSupported(false, result.message);
      return;
    }

    setText(dom.container, 'upd-branch', result.branch || '-');
    setText(dom.container, 'upd-local', shortHash(result.localHash));
    setText(dom.container, 'upd-remote', shortHash(result.remoteHash));

    if (result.ok) {
      const summary = result.hasUpdates
        ? `Updates available (${result.behindCount} commit${result.behindCount === 1 ? '' : 's'} behind).`
        : 'Already up to date.';
      setUpdateSummary(summary);
      return;
    }

    setUpdateSummary(result.message || 'Failed to check updates.');
  };

  const renderJobState = (
    job: UpdateJobSnapshot,
    notify: (message: string, type: 'info' | 'alert') => void
  ): void => {
    renderMissingJobLogs(job);
    dom.updateStateEl.textContent = job.status;

    if (job.check) {
      renderUpdateCheck(job.check);
    }

    if (job.status === 'failed') {
      setUpdateSummary(job.error || 'Update failed.');
      setUpdateBusy(false);
      if (state.notifiedTerminalStatus !== 'failed') {
        notify(job.error || 'Update failed.', 'alert');
      }
    }

    if (job.status === 'completed' || job.status === 'no_changes') {
      setUpdateBusy(false);
      if (job.status === 'no_changes') {
        setUpdateSummary('No changes detected. Build skipped.');
      }
      if (state.notifiedTerminalStatus !== job.status) {
        const doneMessage =
          job.status === 'no_changes'
            ? 'No changes detected. Server already up to date.'
            : 'Update completed successfully.';
        notify(doneMessage, 'info');
      }
    }

    if (job.status === 'pending_restart') {
      setUpdateSummary('Update complete. Server will restart via systemd.');
      setUpdateBusy(true);
      if (state.notifiedTerminalStatus !== 'pending_restart') {
        notify('Update complete. Restarting service via systemd.', 'info');
      }
    }

    if (
      job.status === 'failed' ||
      job.status === 'completed' ||
      job.status === 'no_changes' ||
      job.status === 'pending_restart'
    ) {
      state.notifiedTerminalStatus = job.status;
    }
  };

  return {
    renderInfo,
    renderUpdateCheck,
    renderJobState,
    setUpdateSummary,
    setUpdateBusy,
    setUpdateSupported,
    appendUpdateLog,
    clearUpdateLogs,
    recordRenderedLog,
  };
}
