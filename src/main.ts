import type { CustomMainContext } from './js/types';
import { onPdfViewerLoaded, setPdfViewerOptions, setupGlobalWebViewerDelegate } from './js/pdf-utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function main(_: CustomMainContext) {
  setupGlobalWebViewerDelegate();
  // prevent the pdf web viewer from opening the default pdf
  onPdfViewerLoaded((viewerWindow) => {
    setPdfViewerOptions(viewerWindow, { defaultUrl: '', enableSignatureEditor: true });
  });
}
