import { queryDom, showUnsupported } from './dom';
import { getPromptApiGlobal, getUnsupportedExplanation } from './support';
import { AiPromptController } from './controller';
import type { LanguageDetectorApiGlobal, TranslatorApiGlobal } from './types';

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

  const controller = new AiPromptController(dom, promptApi, translatorApi, languageDetectorApi);
  return controller.init();
}
