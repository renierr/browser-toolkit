import { showMessage } from '@js/ui';
import {
  type AiPromptDom,
  appendOutput,
  getOutputMode,
  renderHistory,
  resetOutput,
  setActionState,
  setContextTelemetry,
  setDownloadState,
  setOutput,
  setOutputMode,
  setStatus,
  setToolModeUi,
} from './dom';
import { PromptConversationHistory } from './conversation-history';
import { PromptHistoryStore } from './history-store';
import { PromptModeClient, TranslatorModeClient } from './modes';
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

export class AiPromptController {
  private readonly dom: AiPromptDom;
  private readonly promptClient: PromptModeClient;
  private readonly translatorClient: TranslatorModeClient | null;
  private readonly history = new PromptConversationHistory(new PromptHistoryStore());

  private promptAbortController: AbortController | null = null;
  private isInitializing = false;
  private isStreaming = false;
  private isDisposed = false;
  private needsConversationRecovery = false;
  private hasContextOverflowed = false;

  public constructor(
    dom: AiPromptDom,
    promptApi: { availability: any; create: any },
    translatorApi: TranslatorApiGlobal | null,
    languageDetectorApi: LanguageDetectorApiGlobal | null
  ) {
    this.dom = dom;
    this.promptClient = new PromptModeClient(promptApi, SESSION_OPTIONS);
    this.translatorClient = translatorApi
      ? new TranslatorModeClient(translatorApi, languageDetectorApi)
      : null;
  }

  public init(): () => void {
    resetOutput(this.dom);
    setToolModeUi(this.dom, this.getMode());
    setOutputMode(this.dom, getOutputMode(this.dom));
    this.dom.targetLanguage.value = this.dom.targetLanguage.value || DEFAULT_TRANSLATOR_TARGET;
    this.onDetectSourceChange();
    this.syncHistoryUi();
    setStatus(this.dom, 'idle');
    setDownloadState(this.dom, false, 0, '');
    this.syncContextTelemetry();
    this.refreshActionState();
    void this.autoInitIfReady();

    const onInitButtonClick = (): void => {
      void this.onInitClick();
    };

    const onAskButtonClick = (): void => {
      void this.onAskClick();
    };

    this.dom.initButton.addEventListener('click', onInitButtonClick);
    this.dom.askButton.addEventListener('click', onAskButtonClick);
    this.dom.stopButton.addEventListener('click', this.onStopClick);
    this.dom.clearButton.addEventListener('click', this.onClearClick);
    this.dom.promptInput.addEventListener('input', this.onPromptInput);
    this.dom.outputMode.addEventListener('change', this.onOutputModeChange);
    this.dom.modeSelect.addEventListener('change', this.onModeChange);
    this.dom.detectSource.addEventListener('change', this.onDetectSourceChange);

    return () => {
      this.isDisposed = true;
      if (this.promptAbortController) {
        this.promptAbortController.abort();
        this.promptAbortController = null;
      }

      this.promptClient.setContextOverflowListener(null);
      this.promptClient.destroy();
      this.translatorClient?.destroy();

      this.dom.initButton.removeEventListener('click', onInitButtonClick);
      this.dom.askButton.removeEventListener('click', onAskButtonClick);
      this.dom.stopButton.removeEventListener('click', this.onStopClick);
      this.dom.clearButton.removeEventListener('click', this.onClearClick);
      this.dom.promptInput.removeEventListener('input', this.onPromptInput);
      this.dom.outputMode.removeEventListener('change', this.onOutputModeChange);
      this.dom.modeSelect.removeEventListener('change', this.onModeChange);
      this.dom.detectSource.removeEventListener('change', this.onDetectSourceChange);
    };
  }

  private readonly onStopClick = (): void => {
    if (!this.promptAbortController) return;
    this.promptAbortController.abort();
  };

  private readonly onClearClick = (): void => {
    resetOutput(this.dom);
    this.history.clear();
    this.needsConversationRecovery = false;
    this.hasContextOverflowed = false;
    this.syncHistoryUi();
    this.syncContextTelemetry();
  };

  private readonly onPromptInput = (): void => {
    this.refreshActionState();
  };

  private readonly onOutputModeChange = (): void => {
    setOutputMode(this.dom, getOutputMode(this.dom));
    this.syncHistoryUi();
  };

  private readonly onModeChange = (): void => {
    const mode = this.getMode();
    setToolModeUi(this.dom, mode);

    if (mode === 'translator') {
      if (!this.translatorClient) {
        showMessage('Translator mode is not supported in this browser.', {
          type: 'warning',
          hideTypeText: false,
          timeoutMs: 3500,
        });
      }

      if (this.dom.detectSource.checked) {
        this.dom.sourceLanguage.disabled = true;
      }
    }

    setStatus(this.dom, this.hasActiveModeReady() ? 'ready' : 'idle');
    this.syncContextTelemetry();
    this.refreshActionState();
  };

  private readonly onDetectSourceChange = (): void => {
    this.dom.sourceLanguage.disabled = this.dom.detectSource.checked;
  };

  private getMode(): ToolModeId {
    return this.dom.modeSelect.value === 'translator' ? 'translator' : 'prompt';
  }

  private hasActiveModeReady(): boolean {
    if (this.getMode() === 'prompt') return this.promptClient.hasSession();
    return this.translatorClient !== null;
  }

  private syncHistoryUi(): void {
    renderHistory(this.dom, this.history.list(), getOutputMode(this.dom));
  }

  private syncContextTelemetry(): void {
    if (this.getMode() !== 'prompt') {
      setContextTelemetry(this.dom, {
        visible: false,
        usage: null,
        window: null,
        percent: null,
        hasOverflowed: false,
      });
      return;
    }

    const telemetry = this.promptClient.getContextTelemetry();
    setContextTelemetry(this.dom, {
      visible: this.promptClient.hasSession(),
      usage: telemetry.usage,
      window: telemetry.window,
      percent: telemetry.percent,
      hasOverflowed: this.hasContextOverflowed,
    });
  }

  private refreshActionState(): void {
    const hasPrompt = this.dom.promptInput.value.trim().length > 0;
    const canAsk =
      this.hasActiveModeReady() && hasPrompt && !this.isInitializing && !this.isStreaming;
    const canStop = this.isStreaming && this.getMode() === 'prompt';
    setActionState(this.dom, { canAsk, canStop });
    this.dom.initButton.disabled = this.isInitializing || this.isStreaming;
  }

  private buildRecoveryConversationMessages(prompt: string): PromptMessage[] {
    const historyMessages = this.history.toConversationMessages(12);
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages,
      { role: 'user', content: prompt },
    ];
  }

  private async onInitClick(): Promise<void> {
    if (this.isInitializing || this.isStreaming) return;

    this.isInitializing = true;
    setStatus(this.dom, 'initializing');
    setDownloadState(this.dom, true, 0, 'Checking availability...');
    this.refreshActionState();

    try {
      if (this.getMode() === 'translator') {
        if (!this.translatorClient) {
          setStatus(this.dom, 'idle');
          setDownloadState(this.dom, false, 0, '');
          showMessage('Translator API not available in this browser.', {
            type: 'warning',
            hideTypeText: false,
          });
          return;
        }

        const result = await this.translatorClient.init((percent) => {
          setDownloadState(
            this.dom,
            true,
            percent,
            `Preparing translation resources... ${percent}%`
          );
        });

        if (!result.ready || result.availability === 'unavailable') {
          setStatus(this.dom, 'idle');
          setDownloadState(this.dom, false, 0, '');
          showMessage('Translator mode unavailable on this device/profile.', {
            type: 'warning',
            hideTypeText: false,
          });
          return;
        }

        this.needsConversationRecovery = false;
        this.hasContextOverflowed = false;
        this.syncContextTelemetry();
        setStatus(this.dom, 'ready');
        setDownloadState(this.dom, false, 0, '');
        showMessage('Translator mode is ready.', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 2500,
        });
        return;
      }

      const result = await this.promptClient.init((percent) => {
        setDownloadState(this.dom, true, percent, `Downloading model... ${percent}%`);
      });

      if (!result.ready || result.availability === 'unavailable') {
        this.needsConversationRecovery = false;
        this.hasContextOverflowed = false;
        this.promptClient.setContextOverflowListener(null);
        this.syncContextTelemetry();
        setStatus(this.dom, 'idle');
        setDownloadState(this.dom, false, 0, '');
        showMessage('Prompt model unavailable on this device/profile.', {
          type: 'warning',
          hideTypeText: false,
        });
        return;
      }

      this.needsConversationRecovery = this.history.list().some((entry) => entry.mode === 'prompt');
      this.hasContextOverflowed = false;
      this.promptClient.setContextOverflowListener(() => {
        this.hasContextOverflowed = true;
        this.syncContextTelemetry();
        showMessage('Model context overflow detected. Older turns may be dropped.', {
          type: 'warning',
          hideTypeText: false,
          timeoutMs: 4000,
        });
      });
      this.syncContextTelemetry();

      setStatus(this.dom, 'ready');
      setDownloadState(this.dom, false, 0, '');
      showMessage('Prompt model is ready.', { type: 'info', hideTypeText: false, timeoutMs: 2500 });
    } catch (error) {
      console.error('[AI Prompt] Failed to initialize mode:', error);
      this.needsConversationRecovery = false;
      this.hasContextOverflowed = false;
      this.promptClient.setContextOverflowListener(null);
      this.syncContextTelemetry();
      setStatus(this.dom, 'idle');
      setDownloadState(this.dom, false, 0, '');
      showMessage('Failed to initialize selected mode.', { type: 'alert', hideTypeText: false });
    } finally {
      this.isInitializing = false;
      this.refreshActionState();
    }
  }

  private async autoInitIfReady(): Promise<void> {
    try {
      if (this.getMode() !== 'prompt') return;
      const availability = await this.promptClient.checkAvailability();
      if (this.isDisposed) return;

      if (availability === 'available') {
        await this.onInitClick();
        return;
      }

      if (availability === 'downloading') {
        setStatus(this.dom, 'initializing');
        setDownloadState(
          this.dom,
          true,
          0,
          'Model download in progress. Click Initialize to attach.'
        );
        showMessage('Model download detected. Click Initialize to continue setup.', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 3500,
        });
        return;
      }

      if (availability === 'downloadable') {
        setStatus(this.dom, 'idle');
        setDownloadState(this.dom, false, 0, '');
        showMessage('Model not downloaded yet. Click Initialize once to start.', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 3500,
        });
      }
    } catch (error) {
      console.error('[AI Prompt] Failed to check auto-init availability:', error);
    }
  }

  private async onAskClick(): Promise<void> {
    const prompt = this.dom.promptInput.value.trim();
    if (!prompt) {
      showMessage('Enter a prompt first.', {
        type: 'warning',
        hideTypeText: false,
        timeoutMs: 2500,
      });
      return;
    }

    const mode = this.getMode();

    if (mode === 'prompt' && !this.promptClient.hasSession()) {
      showMessage('Initialize prompt mode first.', {
        type: 'warning',
        hideTypeText: false,
        timeoutMs: 2500,
      });
      return;
    }

    if (mode === 'translator' && !this.translatorClient) {
      showMessage('Translator API is not available in this browser.', {
        type: 'warning',
        hideTypeText: false,
        timeoutMs: 2500,
      });
      return;
    }

    this.isStreaming = true;
    this.promptAbortController = new AbortController();
    setStatus(this.dom, 'streaming');
    setOutput(this.dom, '');
    this.refreshActionState();

    const historyEntry = this.history.startPrompt({
      mode,
      prompt,
      meta:
        mode === 'translator'
          ? {
              detectSource: this.dom.detectSource.checked,
              sourceLanguage: this.dom.sourceLanguage.value,
              targetLanguage: this.dom.targetLanguage.value,
            }
          : undefined,
    });
    this.syncHistoryUi();

    try {
      if (mode === 'translator') {
        if (!this.translatorClient) throw new Error('Translator mode unavailable');
        const translation = await this.translatorClient.run({
          text: prompt,
          sourceLanguage: this.dom.sourceLanguage.value,
          targetLanguage: this.dom.targetLanguage.value,
          detectSource: this.dom.detectSource.checked,
        });
        setOutput(this.dom, translation.output);
        this.history.appendResponse(historyEntry.id, translation.output);
        this.history.updateMeta(historyEntry.id, {
          effectiveSourceLanguage: translation.detectedLanguage || this.dom.sourceLanguage.value,
          targetLanguage: this.dom.targetLanguage.value,
        });
        this.history.markDone(historyEntry.id);
      } else {
        const promptInput: PromptInput = this.needsConversationRecovery
          ? this.buildRecoveryConversationMessages(prompt)
          : prompt;

        await this.promptClient.stream(
          promptInput,
          (chunk) => {
            this.history.appendResponse(historyEntry.id, chunk);
            appendOutput(this.dom, chunk);
            this.syncHistoryUi();
          },
          this.promptAbortController.signal
        );

        if (!this.dom.outputText.textContent) {
          setOutput(this.dom, 'No response returned.');
          this.history.markDone(historyEntry.id, 'No response returned.');
        } else {
          this.history.markDone(historyEntry.id);
        }
        this.needsConversationRecovery = false;
      }

      this.syncHistoryUi();
      this.syncContextTelemetry();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && mode === 'prompt') {
        this.history.markAborted(
          historyEntry.id,
          'Prompt stopped before any response was returned.'
        );
        const entry = this.history.list().find((item) => item.id === historyEntry.id);
        if (entry && entry.response.trim()) setOutput(this.dom, entry.response);
        this.syncHistoryUi();
        showMessage('Prompt stopped.', { type: 'info', hideTypeText: false, timeoutMs: 2000 });
      } else {
        this.history.markError(historyEntry.id, 'Execution failed before a response was returned.');
        const entry = this.history.list().find((item) => item.id === historyEntry.id);
        if (entry && entry.response.trim()) setOutput(this.dom, entry.response);
        this.syncHistoryUi();
        console.error('[AI Prompt] Failed to run selected mode:', error);
        showMessage('Execution failed. Try again.', { type: 'alert', hideTypeText: false });
      }
    } finally {
      this.promptAbortController = null;
      this.isStreaming = false;
      setStatus(this.dom, this.hasActiveModeReady() ? 'ready' : 'idle');
      this.syncContextTelemetry();
      this.refreshActionState();
    }
  }
}
