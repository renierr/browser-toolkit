import { showMessage } from '@js/ui';
import {
  appendOutput,
  getOutputMode,
  queryDom,
  renderHistory,
  resetOutput,
  setActionState,
  setContextTelemetry,
  setDownloadState,
  setOutput,
  setOutputMode,
  setStatus,
  setToolModeUi,
  showUnsupported,
} from './dom';
import { PromptConversationHistory } from './conversation-history';
import { PromptHistoryStore } from './history-store';
import { PromptModeClient, TranslatorModeClient } from './modes';
import { getPromptApiGlobal, getUnsupportedExplanation } from './support';
import type {
  LanguageDetectorApiGlobal,
  PromptInput,
  PromptMessage,
  PromptSessionOptions,
  ToolModeId,
  TranslatorApiGlobal,
} from './types';

const SESSION_OPTIONS: PromptSessionOptions = {
  expectedInputs: [{ type: 'text' }],
  expectedOutputs: [{ type: 'text' }],
};

const SYSTEM_PROMPT =
  'You are a concise, helpful assistant running fully on-device in Chrome Prompt API. Prefer direct answers and practical steps.';

const DEFAULT_TRANSLATOR_TARGET = 'de';

type TranslatorGlobals = {
  Translator?: TranslatorApiGlobal;
  LanguageDetector?: LanguageDetectorApiGlobal;
};

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

  const globals = self as unknown as TranslatorGlobals;
  const translatorApi = globals.Translator ?? null;
  const languageDetectorApi = globals.LanguageDetector ?? null;

  const promptClient = new PromptModeClient(promptApi, SESSION_OPTIONS);
  const translatorClient = translatorApi
    ? new TranslatorModeClient(translatorApi, languageDetectorApi)
    : null;
  const history = new PromptConversationHistory(new PromptHistoryStore());

  let promptAbortController: AbortController | null = null;
  let isInitializing = false;
  let isStreaming = false;
  let isDisposed = false;
  let needsConversationRecovery = false;
  let hasContextOverflowed = false;

  const getMode = (): ToolModeId =>
    dom.modeSelect.value === 'translator' ? 'translator' : 'prompt';

  const hasActiveModeReady = (): boolean => {
    if (getMode() === 'prompt') return promptClient.hasSession();
    return translatorClient !== null;
  };

  const syncHistoryUi = (): void => {
    renderHistory(dom, history.list(), getOutputMode(dom));
  };

  const syncContextTelemetry = (): void => {
    if (getMode() !== 'prompt') {
      setContextTelemetry(dom, {
        visible: false,
        usage: null,
        window: null,
        percent: null,
        hasOverflowed: false,
      });
      return;
    }

    const telemetry = promptClient.getContextTelemetry();
    setContextTelemetry(dom, {
      visible: promptClient.hasSession(),
      usage: telemetry.usage,
      window: telemetry.window,
      percent: telemetry.percent,
      hasOverflowed: hasContextOverflowed,
    });
  };

  const refreshActionState = (): void => {
    const hasPrompt = dom.promptInput.value.trim().length > 0;
    const canAsk = hasActiveModeReady() && hasPrompt && !isInitializing && !isStreaming;
    const canStop = isStreaming && getMode() === 'prompt';
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
      if (getMode() === 'translator') {
        if (!translatorClient) {
          setStatus(dom, 'idle');
          setDownloadState(dom, false, 0, '');
          showMessage('Translator API not available in this browser.', {
            type: 'warning',
            hideTypeText: false,
          });
          return;
        }

        const result = await translatorClient.init((percent) => {
          setDownloadState(dom, true, percent, `Preparing translation resources... ${percent}%`);
        });

        if (!result.ready || result.availability === 'unavailable') {
          setStatus(dom, 'idle');
          setDownloadState(dom, false, 0, '');
          showMessage('Translator mode unavailable on this device/profile.', {
            type: 'warning',
            hideTypeText: false,
          });
          return;
        }

        needsConversationRecovery = false;
        hasContextOverflowed = false;
        syncContextTelemetry();
        setStatus(dom, 'ready');
        setDownloadState(dom, false, 0, '');
        showMessage('Translator mode is ready.', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 2500,
        });
        return;
      }

      const result = await promptClient.init((percent) => {
        setDownloadState(dom, true, percent, `Downloading model... ${percent}%`);
      });

      if (!result.ready || result.availability === 'unavailable') {
        needsConversationRecovery = false;
        hasContextOverflowed = false;
        promptClient.setContextOverflowListener(null);
        syncContextTelemetry();
        setStatus(dom, 'idle');
        setDownloadState(dom, false, 0, '');
        showMessage('Prompt model unavailable on this device/profile.', {
          type: 'warning',
          hideTypeText: false,
        });
        return;
      }

      needsConversationRecovery = history.list().some((entry) => entry.mode === 'prompt');
      hasContextOverflowed = false;
      promptClient.setContextOverflowListener(() => {
        hasContextOverflowed = true;
        syncContextTelemetry();
        showMessage('Model context overflow detected. Older turns may be dropped.', {
          type: 'warning',
          hideTypeText: false,
          timeoutMs: 4000,
        });
      });
      syncContextTelemetry();

      setStatus(dom, 'ready');
      setDownloadState(dom, false, 0, '');
      showMessage('Prompt model is ready.', { type: 'info', hideTypeText: false, timeoutMs: 2500 });
    } catch (error) {
      console.error('[AI Prompt] Failed to initialize mode:', error);
      needsConversationRecovery = false;
      hasContextOverflowed = false;
      promptClient.setContextOverflowListener(null);
      syncContextTelemetry();
      setStatus(dom, 'idle');
      setDownloadState(dom, false, 0, '');
      showMessage('Failed to initialize selected mode.', { type: 'alert', hideTypeText: false });
    } finally {
      isInitializing = false;
      refreshActionState();
    }
  };

  const autoInitIfReady = async (): Promise<void> => {
    try {
      if (getMode() !== 'prompt') return;
      const availability = await promptClient.checkAvailability();
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

    const mode = getMode();

    if (mode === 'prompt' && !promptClient.hasSession()) {
      showMessage('Initialize prompt mode first.', {
        type: 'warning',
        hideTypeText: false,
        timeoutMs: 2500,
      });
      return;
    }

    if (mode === 'translator' && !translatorClient) {
      showMessage('Translator API is not available in this browser.', {
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

    const historyEntry = history.startPrompt({
      mode,
      prompt,
      meta:
        mode === 'translator'
          ? {
              detectSource: dom.detectSource.checked,
              sourceLanguage: dom.sourceLanguage.value,
              targetLanguage: dom.targetLanguage.value,
            }
          : undefined,
    });
    syncHistoryUi();

    try {
      if (mode === 'translator') {
        if (!translatorClient) throw new Error('Translator mode unavailable');
        const translation = await translatorClient.run({
          text: prompt,
          sourceLanguage: dom.sourceLanguage.value,
          targetLanguage: dom.targetLanguage.value,
          detectSource: dom.detectSource.checked,
        });
        setOutput(dom, translation.output);
        history.appendResponse(historyEntry.id, translation.output);
        history.updateMeta(historyEntry.id, {
          effectiveSourceLanguage: translation.detectedLanguage || dom.sourceLanguage.value,
          targetLanguage: dom.targetLanguage.value,
        });
        history.markDone(historyEntry.id);
      } else {
        const promptInput: PromptInput = needsConversationRecovery
          ? buildRecoveryConversationMessages(prompt)
          : prompt;

        await promptClient.stream(
          promptInput,
          (chunk) => {
            history.appendResponse(historyEntry.id, chunk);
            appendOutput(dom, chunk);
            syncHistoryUi();
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
      }

      syncHistoryUi();
      syncContextTelemetry();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && mode === 'prompt') {
        history.markAborted(historyEntry.id, 'Prompt stopped before any response was returned.');
        const entry = history.list().find((item) => item.id === historyEntry.id);
        if (entry && entry.response.trim()) setOutput(dom, entry.response);
        syncHistoryUi();
        showMessage('Prompt stopped.', { type: 'info', hideTypeText: false, timeoutMs: 2000 });
      } else {
        history.markError(historyEntry.id, 'Execution failed before a response was returned.');
        const entry = history.list().find((item) => item.id === historyEntry.id);
        if (entry && entry.response.trim()) setOutput(dom, entry.response);
        syncHistoryUi();
        console.error('[AI Prompt] Failed to run selected mode:', error);
        showMessage('Execution failed. Try again.', { type: 'alert', hideTypeText: false });
      }
    } finally {
      promptAbortController = null;
      isStreaming = false;
      setStatus(dom, hasActiveModeReady() ? 'ready' : 'idle');
      syncContextTelemetry();
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
    hasContextOverflowed = false;
    syncHistoryUi();
    syncContextTelemetry();
  };

  const onPromptInput = (): void => {
    refreshActionState();
  };

  const onOutputModeChange = (): void => {
    const mode = getOutputMode(dom);
    setOutputMode(dom, mode);
    syncHistoryUi();
  };

  const onModeChange = (): void => {
    const mode = getMode();
    setToolModeUi(dom, mode);

    if (mode === 'translator') {
      if (!translatorClient) {
        showMessage('Translator mode is not supported in this browser.', {
          type: 'warning',
          hideTypeText: false,
          timeoutMs: 3500,
        });
      }

      if (dom.detectSource.checked) {
        dom.sourceLanguage.disabled = true;
      }
    }

    setStatus(dom, hasActiveModeReady() ? 'ready' : 'idle');
    syncContextTelemetry();
    refreshActionState();
  };

  const onDetectSourceChange = (): void => {
    dom.sourceLanguage.disabled = dom.detectSource.checked;
  };

  resetOutput(dom);
  setToolModeUi(dom, getMode());
  setOutputMode(dom, getOutputMode(dom));
  dom.targetLanguage.value = dom.targetLanguage.value || DEFAULT_TRANSLATOR_TARGET;
  onDetectSourceChange();
  syncHistoryUi();
  setStatus(dom, 'idle');
  setDownloadState(dom, false, 0, '');
  syncContextTelemetry();
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
  dom.modeSelect.addEventListener('change', onModeChange);
  dom.detectSource.addEventListener('change', onDetectSourceChange);

  return () => {
    isDisposed = true;
    if (promptAbortController) {
      promptAbortController.abort();
      promptAbortController = null;
    }

    promptClient.setContextOverflowListener(null);
    promptClient.destroy();
    translatorClient?.destroy();

    dom.initButton.removeEventListener('click', onInitButtonClick);
    dom.askButton.removeEventListener('click', onAskButtonClick);
    dom.stopButton.removeEventListener('click', onStopClick);
    dom.clearButton.removeEventListener('click', onClearClick);
    dom.promptInput.removeEventListener('input', onPromptInput);
    dom.outputMode.removeEventListener('change', onOutputModeChange);
    dom.modeSelect.removeEventListener('change', onModeChange);
    dom.detectSource.removeEventListener('change', onDetectSourceChange);
  };
}
