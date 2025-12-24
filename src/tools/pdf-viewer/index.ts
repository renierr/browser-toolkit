import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import pdfiumWasmUrl from '@embedpdf/snippet/dist/pdfium.wasm?url';
import { isDarkMode } from '../../js/theme.ts';

// dynamic importing of large pdf libs to reduce chunk size and loading time
const pdfjsLib = await import('pdfjs-dist');
const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default ?? workerModule;


const toggleToolCard = (show: boolean) => {
  const toolCardElement = document.getElementById('pdf-edit-tool-card');
  if (!toolCardElement) return;
  if (show) {
    toolCardElement.classList.remove('hidden');
  } else {
    toolCardElement.classList.add('hidden');
  }
};

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    showProgress('Load PDF file...');
    const arrayBuffer = await files[0].arrayBuffer();

    // create blob URL and post to iframe viewer
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const { default: EmbedPDF } = await import('@embedpdf/snippet');

    const container = document.getElementById('pdf-viewer-container');
    if (container) {
      // make absolute (works whether vite emits `/assets/...` or a relative path)
      const absolutePdfiumWasmUrl = new URL(pdfiumWasmUrl, location.href).href;
      EmbedPDF.init({
        type: 'container',
        target: container,
        wasmUrl: absolutePdfiumWasmUrl,
        src: blobUrl,
        theme: { preference: isDarkMode() ? 'dark' : 'system' },
      });
    } else {
      showMessage('Failed to load PDF viewer (container element not present).', { type: 'alert' });
    }

    toggleToolCard(false);
    hideProgress();
    showMessage(`PDF ${files[0].name} loaded.`, { timeoutMs: 5000 });
  });
}
