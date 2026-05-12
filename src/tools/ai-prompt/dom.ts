import { applyMarkdownContentTheme, renderMarkdownContent } from '@js/markdown-content';
import type { OutputMode, PromptApiStatus, PromptHistoryEntry } from './types';

export type AiPromptDom = {
  unsupported: HTMLDivElement;
  unsupportedText: HTMLParagraphElement;
  main: HTMLDivElement;
  initButton: HTMLButtonElement;
  askButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  stateBadge: HTMLSpanElement;
  streamState: HTMLSpanElement;
  promptInput: HTMLTextAreaElement;
  modeSelect: HTMLSelectElement;
  translatorControls: HTMLDivElement;
  detectSource: HTMLInputElement;
  sourceLanguage: HTMLSelectElement;
  targetLanguage: HTMLSelectElement;
  outputMode: HTMLSelectElement;
  outputText: HTMLPreElement;
  outputMarkdown: HTMLDivElement;
  historyList: HTMLDivElement;
  historyEmpty: HTMLParagraphElement;
  historyCount: HTMLSpanElement;
  contextTelemetry: HTMLDivElement;
  contextUsageLabel: HTMLSpanElement;
  contextUsageProgress: HTMLProgressElement;
  contextNote: HTMLParagraphElement;
  downloadProgress: HTMLProgressElement;
  downloadText: HTMLParagraphElement;
};

export function queryDom(container: HTMLElement): AiPromptDom | null {
  const unsupported = container.querySelector('#ai-prompt-unsupported') as HTMLDivElement | null;
  const unsupportedText = container.querySelector(
    '#ai-prompt-unsupported-text'
  ) as HTMLParagraphElement | null;
  const main = container.querySelector('#ai-prompt-main') as HTMLDivElement | null;
  const initButton = container.querySelector('#ai-init-btn') as HTMLButtonElement | null;
  const askButton = container.querySelector('#ai-ask-btn') as HTMLButtonElement | null;
  const stopButton = container.querySelector('#ai-stop-btn') as HTMLButtonElement | null;
  const clearButton = container.querySelector('#ai-clear-btn') as HTMLButtonElement | null;
  const stateBadge = container.querySelector('#ai-state-badge') as HTMLSpanElement | null;
  const streamState = container.querySelector('#ai-stream-state') as HTMLSpanElement | null;
  const promptInput = container.querySelector('#ai-prompt-input') as HTMLTextAreaElement | null;
  const modeSelect = container.querySelector('#ai-mode-select') as HTMLSelectElement | null;
  const translatorControls = container.querySelector(
    '#ai-translator-controls'
  ) as HTMLDivElement | null;
  const detectSource = container.querySelector('#ai-detect-source') as HTMLInputElement | null;
  const sourceLanguage = container.querySelector('#ai-source-language') as HTMLSelectElement | null;
  const targetLanguage = container.querySelector('#ai-target-language') as HTMLSelectElement | null;
  const outputMode = container.querySelector('#ai-output-mode') as HTMLSelectElement | null;
  const outputText = container.querySelector('#ai-output-text') as HTMLPreElement | null;
  const outputMarkdown = container.querySelector('#ai-output-markdown') as HTMLDivElement | null;
  const historyList = container.querySelector('#ai-history-list') as HTMLDivElement | null;
  const historyEmpty = container.querySelector('#ai-history-empty') as HTMLParagraphElement | null;
  const historyCount = container.querySelector('#ai-history-count') as HTMLSpanElement | null;
  const contextTelemetry = container.querySelector(
    '#ai-context-telemetry'
  ) as HTMLDivElement | null;
  const contextUsageLabel = container.querySelector(
    '#ai-context-usage-label'
  ) as HTMLSpanElement | null;
  const contextUsageProgress = container.querySelector(
    '#ai-context-usage-progress'
  ) as HTMLProgressElement | null;
  const contextNote = container.querySelector('#ai-context-note') as HTMLParagraphElement | null;
  const downloadProgress = container.querySelector(
    '#ai-download-progress'
  ) as HTMLProgressElement | null;
  const downloadText = container.querySelector('#ai-download-text') as HTMLParagraphElement | null;

  if (
    !unsupported ||
    !unsupportedText ||
    !main ||
    !initButton ||
    !askButton ||
    !stopButton ||
    !clearButton ||
    !stateBadge ||
    !streamState ||
    !promptInput ||
    !modeSelect ||
    !translatorControls ||
    !detectSource ||
    !sourceLanguage ||
    !targetLanguage ||
    !outputMode ||
    !outputText ||
    !outputMarkdown ||
    !historyList ||
    !historyEmpty ||
    !historyCount ||
    !contextTelemetry ||
    !contextUsageLabel ||
    !contextUsageProgress ||
    !contextNote ||
    !downloadProgress ||
    !downloadText
  ) {
    return null;
  }

  return {
    unsupported,
    unsupportedText,
    main,
    initButton,
    askButton,
    stopButton,
    clearButton,
    stateBadge,
    streamState,
    promptInput,
    modeSelect,
    translatorControls,
    detectSource,
    sourceLanguage,
    targetLanguage,
    outputMode,
    outputText,
    outputMarkdown,
    historyList,
    historyEmpty,
    historyCount,
    contextTelemetry,
    contextUsageLabel,
    contextUsageProgress,
    contextNote,
    downloadProgress,
    downloadText,
  };
}

export function showUnsupported(dom: AiPromptDom, text: string): void {
  dom.unsupportedText.textContent = text;
  dom.unsupported.classList.remove('hidden');
  dom.main.classList.add('opacity-60', 'pointer-events-none');
  dom.initButton.disabled = true;
  dom.askButton.disabled = true;
  dom.stopButton.disabled = true;
}

export function setDownloadState(
  dom: AiPromptDom,
  visible: boolean,
  percent: number,
  text: string
): void {
  dom.downloadProgress.classList.toggle('hidden', !visible);
  dom.downloadText.classList.toggle('hidden', !visible);
  dom.downloadProgress.value = percent;
  dom.downloadText.textContent = text;
}

export function setOutput(dom: AiPromptDom, text: string): void {
  dom.outputText.textContent = text;
  dom.outputMarkdown.innerHTML = renderMarkdownContent(text);
}

export function appendOutput(dom: AiPromptDom, text: string): void {
  dom.outputText.textContent += text;
  dom.outputMarkdown.innerHTML = renderMarkdownContent(dom.outputText.textContent);
  const active = dom.outputMode.value === 'markdown' ? dom.outputMarkdown : dom.outputText;
  active.scrollTop = active.scrollHeight;
}

export function resetOutput(dom: AiPromptDom): void {
  setOutput(dom, 'No response yet.');
}

export function getOutputMode(dom: AiPromptDom): OutputMode {
  return dom.outputMode.value === 'markdown' ? 'markdown' : 'plain';
}

export function setOutputMode(dom: AiPromptDom, mode: OutputMode): void {
  dom.outputText.classList.toggle('hidden', mode !== 'plain');
  dom.outputMarkdown.classList.toggle('hidden', mode !== 'markdown');
  if (mode === 'markdown') {
    applyMarkdownContentTheme(dom.outputMarkdown, 'default');
  }
}

export function setToolModeUi(dom: AiPromptDom, mode: 'prompt' | 'translator'): void {
  dom.translatorControls.classList.toggle('hidden', mode !== 'translator');
}

function toPreview(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

export function renderHistory(
  dom: AiPromptDom,
  entries: PromptHistoryEntry[],
  mode: OutputMode
): void {
  dom.historyCount.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  dom.historyEmpty.classList.toggle('hidden', entries.length > 0);

  dom.historyList.querySelectorAll('[data-history-entry]').forEach((node) => node.remove());

  if (entries.length === 0) return;

  const fragment = document.createDocumentFragment();

  for (const entry of entries) {
    const details = document.createElement('details');
    details.className = 'collapse collapse-arrow bg-base-100 border border-base-300 mb-2';
    details.setAttribute('data-history-entry', String(entry.id));

    const summary = document.createElement('summary');
    summary.className = 'collapse-title py-3 pr-10';
    const statusBadgeClass =
      entry.status === 'done'
        ? 'badge-success'
        : entry.status === 'streaming'
          ? 'badge-warning'
          : entry.status === 'aborted'
            ? 'badge-ghost'
            : 'badge-error';
    summary.innerHTML = `
      <div class="flex items-center gap-2 text-xs text-base-content/60 mb-1">
        <span>${new Date(entry.createdAt).toLocaleTimeString()}</span>
        <span class="badge badge-xs ${statusBadgeClass}">${entry.status}</span>
      </div>
      <div class="font-semibold text-sm truncate">${toPreview(entry.prompt, 90)}</div>
    `;

    const body = document.createElement('div');
    body.className = 'collapse-content pt-0';

    const promptLabel = document.createElement('p');
    promptLabel.className = 'text-xs uppercase tracking-wide text-base-content/60 mb-1';
    promptLabel.textContent = 'Prompt';

    const promptText = document.createElement('pre');
    promptText.className =
      'whitespace-pre-wrap break-words text-sm bg-base-200 p-3 rounded-lg mb-3';
    promptText.textContent = entry.prompt;

    const responseLabel = document.createElement('p');
    responseLabel.className = 'text-xs uppercase tracking-wide text-base-content/60 mb-1';
    responseLabel.textContent = 'Response';

    const responseContainer = document.createElement('div');
    responseContainer.className = 'bg-base-200 p-3 rounded-lg';

    if (mode === 'markdown') {
      responseContainer.classList.add('md-content');
      responseContainer.innerHTML = renderMarkdownContent(entry.response);
      applyMarkdownContentTheme(responseContainer, 'default');
    } else {
      const responseText = document.createElement('pre');
      responseText.className = 'whitespace-pre-wrap break-words text-sm';
      responseText.textContent = entry.response;
      responseContainer.appendChild(responseText);
    }

    body.appendChild(promptLabel);
    body.appendChild(promptText);
    body.appendChild(responseLabel);
    body.appendChild(responseContainer);

    details.appendChild(summary);
    details.appendChild(body);
    fragment.appendChild(details);
  }

  dom.historyList.appendChild(fragment);
}

export function setContextTelemetry(
  dom: AiPromptDom,
  args: {
    visible: boolean;
    usage: number | null;
    window: number | null;
    percent: number | null;
    hasOverflowed: boolean;
  }
): void {
  dom.contextTelemetry.classList.toggle('hidden', !args.visible);

  if (!args.visible) {
    dom.contextUsageLabel.textContent = '-- / --';
    dom.contextUsageProgress.value = 0;
    dom.contextNote.textContent = 'Context tracks how much conversation memory is currently used.';
    return;
  }

  const usageText = args.usage !== null ? String(args.usage) : '--';
  const windowText = args.window !== null ? String(args.window) : '--';
  dom.contextUsageLabel.textContent = `${usageText} / ${windowText}`;
  dom.contextUsageProgress.value = args.percent ?? 0;

  if (args.hasOverflowed) {
    dom.contextNote.textContent =
      'Context overflow occurred. Older turns may have been dropped by the model session.';
  } else if (args.percent !== null) {
    dom.contextNote.textContent = `Session context currently uses about ${args.percent}% of available tokens.`;
  } else {
    dom.contextNote.textContent = 'Context metrics are not exposed by this browser build yet.';
  }
}

export function setStatus(dom: AiPromptDom, status: PromptApiStatus): void {
  if (status === 'idle') {
    dom.stateBadge.textContent = 'Not initialized';
    dom.stateBadge.className = 'badge badge-outline';
    dom.streamState.textContent = 'Idle';
    return;
  }

  if (status === 'initializing') {
    dom.stateBadge.textContent = 'Initializing';
    dom.stateBadge.className = 'badge badge-warning';
    dom.streamState.textContent = 'Preparing model';
    return;
  }

  if (status === 'ready') {
    dom.stateBadge.textContent = 'Ready';
    dom.stateBadge.className = 'badge badge-success';
    dom.streamState.textContent = 'Idle';
    return;
  }

  dom.stateBadge.textContent = 'Ready';
  dom.stateBadge.className = 'badge badge-success';
  dom.streamState.textContent = 'Streaming';
}

export function setActionState(
  dom: AiPromptDom,
  args: { canAsk: boolean; canStop: boolean }
): void {
  dom.askButton.disabled = !args.canAsk;
  dom.stopButton.disabled = !args.canStop;
}
