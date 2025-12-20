import type { CustomMainContext } from './js/types';
import { onPdfViewerLoaded, setPdfViewerOptions, setupGlobalWebViewerDelegate } from './js/pdf-utils.ts';

export default function main(ctx: CustomMainContext) {
  console.log('Loaded tools:', ctx.tools.length);

  setupGlobalWebViewerDelegate();
  // prevent the pdf web viewer from opening the default pdf
  onPdfViewerLoaded((viewerWindow) => {
    setPdfViewerOptions(viewerWindow, { defaultUrl: '', enableSignatureEditor: true });
  });
}
