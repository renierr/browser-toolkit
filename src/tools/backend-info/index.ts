import { fetchApi, fetchJson } from '../../js/api';
import { showMessage } from '../../js/ui';
import { getBackendInfoDom } from './dom';
import { createRenderer } from './render';
import type { BackendInfoResponse, UpdateCheckResult, UpdateEvent, UpdateJobSnapshot } from './types';

export default function init(): void | (() => void) {
  const dom = getBackendInfoDom('backend-info-tool');
  if (!dom) {
    return;
  }

  const renderer = createRenderer(dom);
  let updateStreamController: AbortController | null = null;

  const notify = (message: string, type: 'info' | 'alert'): void => {
    showMessage(message, { type, timeoutMs: 4000 });
  };

  const stopUpdateStream = (): void => {
    if (!updateStreamController) {
      return;
    }
    updateStreamController.abort();
    updateStreamController = null;
  };

  const connectUpdateStream = async (jobId: string): Promise<void> => {
    stopUpdateStream();
    updateStreamController = new AbortController();
    let reachedTerminalState = false;

    try {
      const response = await fetchApi(`/update/stream/${jobId}`, {
        signal: updateStreamController.signal,
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
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const lines = chunk.split(/\r?\n/);
          const dataLines = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart());
          if (dataLines.length === 0) {
            continue;
          }

          const dataText = dataLines.join('\n');
          try {
            const event = JSON.parse(dataText) as UpdateEvent;
            if (event.type === 'log') {
              renderer.appendUpdateLog(event.entry.message);
              renderer.recordRenderedLog();
            }
            if (event.type === 'state') {
              renderer.renderJobState(event.job, notify);
              if (
                event.job.status === 'failed' ||
                event.job.status === 'completed' ||
                event.job.status === 'no_changes' ||
                event.job.status === 'pending_restart'
              ) {
                reachedTerminalState = true;
                return;
              }
            }
          } catch {
            renderer.appendUpdateLog(`[client] failed to parse event: ${dataText}`);
          }
        }
      }

      if (!reachedTerminalState) {
        const latestJob = await fetchJson<UpdateJobSnapshot>(`/update/job/${jobId}`);
        renderer.renderJobState(latestJob, notify);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('[BackendInfo] Update SSE failed:', error);
        try {
          const latestJob = await fetchJson<UpdateJobSnapshot>(`/update/job/${jobId}`);
          renderer.renderJobState(latestJob, notify);
        } catch {
          renderer.setUpdateSummary('Lost connection to update stream.');
          renderer.setUpdateBusy(false);
        }
      }
    }
  };

  const fetchInfo = async (): Promise<void> => {
    dom.loadingEl.classList.remove('hidden');
    dom.errorEl.classList.add('hidden');
    dom.contentEl.classList.add('hidden');
    dom.refreshBtn.disabled = true;

    try {
      const data = await fetchJson<BackendInfoResponse>('/info');
      renderer.renderInfo(data);
      dom.contentEl.classList.remove('hidden');
    } catch (error) {
      console.error('[BackendInfo] Failed to fetch info:', error);
      dom.errorEl.classList.remove('hidden');
    } finally {
      dom.loadingEl.classList.add('hidden');
      dom.refreshBtn.disabled = false;
    }
  };

  const checkUpdates = async (silent = false): Promise<void> => {
    renderer.setUpdateBusy(true);
    try {
      const result = await fetchJson<UpdateCheckResult>('/update/check');
      renderer.renderUpdateCheck(result);
      if (!silent) {
        const message = result.hasUpdates
          ? `Update available: ${result.behindCount} commit${result.behindCount === 1 ? '' : 's'} behind.`
          : 'Already up to date.';
        notify(message, 'info');
      }
      dom.updateStateEl.textContent = 'idle';
    } catch (error) {
      console.error('[BackendInfo] Failed to check updates:', error);
      const message = (error as Error).message || 'Failed to check updates.';
      renderer.setUpdateSummary(message);
      notify(message, 'alert');
    } finally {
      renderer.setUpdateBusy(false);
    }
  };

  const runUpdate = async (): Promise<void> => {
    const force = dom.forceToggle.checked === true;
    const confirmText = force
      ? 'Run forced update now? This will pull/build even if no git changes.'
      : 'Run update now? Server will restart automatically after success.';
    if (!window.confirm(confirmText)) {
      return;
    }

    renderer.clearUpdateLogs();
    renderer.appendUpdateLog('[client] starting update job...');
    renderer.setUpdateBusy(true);
    dom.updateStateEl.textContent = 'starting';

    try {
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
        body: JSON.stringify({ force }),
      });

      renderer.appendUpdateLog(`[server] ${result.message}`);
      renderer.renderJobState(result.job, notify);
      notify(result.message, 'info');

      if (!result.started) {
        renderer.setUpdateBusy(false);
        return;
      }

      void connectUpdateStream(result.jobId);
    } catch (error) {
      console.error('[BackendInfo] Failed to start update:', error);
      const message = (error as Error).message || 'Failed to start update job.';
      renderer.appendUpdateLog(`[client] ${message}`);
      renderer.setUpdateSummary('Failed to start update job.');
      notify(message, 'alert');
      renderer.setUpdateBusy(false);
    }
  };

  const onRefresh = (): void => {
    void fetchInfo();
  };

  const onCheckUpdates = (): void => {
    void checkUpdates();
  };

  const onRunUpdate = (): void => {
    void runUpdate();
  };

  dom.refreshBtn.addEventListener('click', onRefresh);
  dom.checkUpdateBtn.addEventListener('click', onCheckUpdates);
  dom.runUpdateBtn.addEventListener('click', onRunUpdate);

  void fetchInfo();
  void checkUpdates(true);

  return () => {
    dom.refreshBtn.removeEventListener('click', onRefresh);
    dom.checkUpdateBtn.removeEventListener('click', onCheckUpdates);
    dom.runUpdateBtn.removeEventListener('click', onRunUpdate);
    stopUpdateStream();
  };
}
