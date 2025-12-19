import type { CustomMainContext } from './js/types';
import { setPdfViewerOptions } from './js/pdf-utils.ts';

export default function main(ctx: CustomMainContext) {
  console.log('Loaded tools:', ctx.tools.length);

  // globally prevent the pdf web viewer from opening the default pdf
  document.addEventListener('webviewerloaded', async (evt: any) => {
    setPdfViewerOptions(evt?.detail?.source, { defaultUrl: ''});
  });
}
