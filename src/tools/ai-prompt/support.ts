import type { PromptApiGlobal } from './types';

type PromptApiWindow = Window & {
  LanguageModel?: PromptApiGlobal;
};

function isLikelyMobileBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

export function getPromptApiGlobal(): PromptApiGlobal | null {
  const languageModel = (window as PromptApiWindow).LanguageModel;
  if (!languageModel) return null;
  if (typeof languageModel.availability !== 'function') return null;
  if (typeof languageModel.create !== 'function') return null;
  return languageModel;
}

export function getUnsupportedExplanation(): string {
  if (isLikelyMobileBrowser()) {
    return 'Prompt API currently works on desktop Chrome only. Mobile Chrome is not supported for Gemini Nano APIs yet.';
  }

  return 'This browser does not expose Chrome Prompt API. Use recent desktop Chrome with on-device AI enabled and enough disk/RAM for model download.';
}
