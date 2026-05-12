import type { PromptApiStatus } from './types';

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
  output: HTMLPreElement;
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
  const output = container.querySelector('#ai-output') as HTMLPreElement | null;
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
    !output ||
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
    output,
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
  dom.output.textContent = text;
}

export function appendOutput(dom: AiPromptDom, text: string): void {
  dom.output.textContent += text;
  dom.output.scrollTop = dom.output.scrollHeight;
}

export function resetOutput(dom: AiPromptDom): void {
  dom.output.textContent = 'No response yet.';
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
