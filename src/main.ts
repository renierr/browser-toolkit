import type { CustomMainContext } from './js/types';

export default function main(ctx: CustomMainContext) {
  console.log('Loaded tools:', ctx.tools.length);

  // globally prevent the pdf web viewer from opening the default pdf
  document.addEventListener('webviewerloaded', async (evt: any) => {
    evt?.detail?.source?.PDFViewerApplicationOptions.set('defaultUrl', '');
  });
}
