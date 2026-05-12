import { showMessage } from '@js/ui';
import {
  queryDom,
  showUnsupported,
  setActionState,
  setDownloadState,
  getOutputMode,
  setOutput,
  setOutputMode,
  renderHistory,
  appendOutput,
  resetOutput,
  setStatus,
} from './dom';
import { PromptConversationHistory } from './conversation-history';
import { PromptHistoryStore } from './history-store';
import { PromptSessionManager } from './session-manager';
import { getPromptApiGlobal, getUnsupportedExplanation } from './support';
import type { PromptMessage, PromptInput, PromptSessionOptions } from './types';

const SESSION_OPTIONS: PromptSessionOptions = {
  expectedInputs: [{ type: 'text' }],
  expectedOutputs: [{ type: 'text' }],
};

const SYSTEM_PROMPT =
  'You are a concise, helpful assistant running fully on-device in Chrome Prompt API. Prefer direct answers and practical steps.';

export default function init(): void | (() => void) {
  const container = document.getElementById('tool-content');
  if (!container) return;

  const dom = queryDom(container);
  if (!dom) {
    console.error('[AI Prompt] Required DOM elements not found.');
    return;
  }

  const promptApi = getPromptApiGlobal();
  if (!promptApi) {
    showUnsupported(dom, getUnsupportedExplanation());
    return;
  }

  const manager = new PromptSessionManager(promptApi, SESSION_OPTIONS);
  const history = new PromptConversationHistory(new PromptHistoryStore());
  let promptAbortController: AbortController | null = null;
  let isInitializing = false;
  let isStreaming = false;
  let isDisposed = false;
  let needsConversationRecovery = false;

  const syncHistoryUi = (): void => {
    renderHistory(dom, history.list(), getOutputMode(dom));
  };

  const refreshActionState = (): void => {
    const hasPrompt = dom.promptInput.value.trim().length > 0;
    const canAsk = manager.hasSession() && hasPrompt && !isInitializing && !isStreaming;
    const canStop = isStreaming;
    setActionState(dom, { canAsk, canStop });
    dom.initButton.disabled = isInitializing || isStreaming;
  };

  const buildRecoveryConversationMessages = (prompt: string): PromptMessage[] => {
    const historyMessages = history.toConversationMessages(12);
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages,
      { role: 'user', content: prompt },
    ];
  };

  const onInitClick = async (): Promise<void> => {
    if (isInitializing || isStreaming) return;

    isInitializing = true;
    setStatus(dom, 'initializing');
    setDownloadState(dom, true, 0, 'Checking availability...');
    refreshActionState();

    try {
      const result = await manager.init((percent) => {
        setDownloadState(dom, true, percent, `Downloading model... ${percent}%`);
      });

      if (!result.session || result.availability === 'unavailable') {
        needsConversationRecovery = false;
        setStatus(dom, 'idle');
        setDownloadState(dom, false, 0, '');
        showMessage('Prompt model unavailable on this device/profile.', {
          type: 'warning',
          hideTypeText: false,
        });
        return;
      }

      setStatus(dom, 'ready');
      setDownloadState(dom, false, 0, '');
      needsConversationRecovery = history.list().length > 0;
      showMessage('Prompt model is ready.', { type: 'info', hideTypeText: false, timeoutMs: 2500 });
    } catch (error) {
      console.error('[AI Prompt] Failed to initialize model:', error);
      needsConversationRecovery = false;
      setStatus(dom, 'idle');
      setDownloadState(dom, false, 0, '');
      showMessage('Failed to initialize Prompt API model.', { type: 'alert', hideTypeText: false });
    } finally {
      isInitializing = false;
      refreshActionState();
    }
  };

  const autoInitIfReady = async (): Promise<void> => {
    try {
      const availability = await manager.checkAvailability();
      if (isDisposed) return;

      if (availability === 'available') {
        await onInitClick();
        return;
      }

      if (availability === 'downloading') {
        setStatus(dom, 'initializing');
        setDownloadState(dom, true, 0, 'Model download in progress. Click Initialize to attach.');
        showMessage('Model download detected. Click Initialize to continue setup.', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 3500,
        });
        return;
      }

      if (availability === 'downloadable') {
        setStatus(dom, 'idle');
        setDownloadState(dom, false, 0, '');
        showMessage('Model not downloaded yet. Click Initialize once to start.', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 3500,
        });
      }
    } catch (error) {
      console.error('[AI Prompt] Failed to check auto-init availability:', error);
    }
  };

  const onAskClick = async (): Promise<void> => {
    const prompt = dom.promptInput.value.trim();
    if (!prompt) {
      showMessage('Enter a prompt first.', {
        type: 'warning',
        hideTypeText: false,
        timeoutMs: 2500,
      });
      return;
    }

    if (!manager.hasSession()) {
      showMessage('Initialize model first.', {
        type: 'warning',
        hideTypeText: false,
        timeoutMs: 2500,
      });
      return;
    }

    isStreaming = true;
    promptAbortController = new AbortController();
    setStatus(dom, 'streaming');
    setOutput(dom, '');
    refreshActionState();

    const historyEntry = history.startPrompt(prompt);
    syncHistoryUi();

    try {
      const promptInput: PromptInput = needsConversationRecovery
        ? buildRecoveryConversationMessages(prompt)
        : prompt;

      await manager.stream(
        promptInput,
        {
          onChunk: (chunk) => {
            history.appendResponse(historyEntry.id, chunk);
            appendOutput(dom, chunk);
            syncHistoryUi();
          },
        },
        promptAbortController.signal
      );

      if (!dom.outputText.textContent) {
        setOutput(dom, 'No response returned.');
        history.markDone(historyEntry.id, 'No response returned.');
      } else {
        history.markDone(historyEntry.id);
      }
      needsConversationRecovery = false;
      syncHistoryUi();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        history.markAborted(historyEntry.id, 'Prompt stopped before any response was returned.');
        const entry = history.list().find((item) => item.id === historyEntry.id);
        if (entry && entry.response.trim()) setOutput(dom, entry.response);
        syncHistoryUi();
        showMessage('Prompt stopped.', { type: 'info', hideTypeText: false, timeoutMs: 2000 });
      } else {
        history.markError(historyEntry.id, 'Prompt failed before a response was returned.');
        const entry = history.list().find((item) => item.id === historyEntry.id);
        if (entry && entry.response.trim()) setOutput(dom, entry.response);
        syncHistoryUi();
        console.error('[AI Prompt] Failed to stream response:', error);
        showMessage('Prompt failed. Try again.', { type: 'alert', hideTypeText: false });
      }
    } finally {
      promptAbortController = null;
      isStreaming = false;
      setStatus(dom, manager.hasSession() ? 'ready' : 'idle');
      refreshActionState();
    }
  };

  const onStopClick = (): void => {
    if (!promptAbortController) return;
    promptAbortController.abort();
  };

  const onClearClick = (): void => {
    resetOutput(dom);
    history.clear();
    needsConversationRecovery = false;
    syncHistoryUi();
  };

  const onPromptInput = (): void => {
    refreshActionState();
  };

  const onOutputModeChange = (): void => {
    const mode = getOutputMode(dom);
    setOutputMode(dom, mode);
    syncHistoryUi();
  };

  resetOutput(dom);
  setOutputMode(dom, getOutputMode(dom));
  syncHistoryUi();
  setStatus(dom, 'idle');
  setDownloadState(dom, false, 0, '');
  refreshActionState();
  void autoInitIfReady();

  const onInitButtonClick = (): void => {
    void onInitClick();
  };
  const onAskButtonClick = (): void => {
    void onAskClick();
  };

  dom.initButton.addEventListener('click', onInitButtonClick);
  dom.askButton.addEventListener('click', onAskButtonClick);
  dom.stopButton.addEventListener('click', onStopClick);
  dom.clearButton.addEventListener('click', onClearClick);
  dom.promptInput.addEventListener('input', onPromptInput);
  dom.outputMode.addEventListener('change', onOutputModeChange);

  return () => {
    isDisposed = true;
    if (promptAbortController) {
      promptAbortController.abort();
      promptAbortController = null;
    }
    manager.destroy();

    dom.initButton.removeEventListener('click', onInitButtonClick);
    dom.askButton.removeEventListener('click', onAskButtonClick);
    dom.stopButton.removeEventListener('click', onStopClick);
    dom.clearButton.removeEventListener('click', onClearClick);
    dom.promptInput.removeEventListener('input', onPromptInput);
    dom.outputMode.removeEventListener('change', onOutputModeChange);
  };
}
