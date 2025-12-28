import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import pdfiumWasmUrl from '@embedpdf/snippet/dist/pdfium.wasm?url';
import { isDarkMode } from '../../js/theme.ts';
import {
  default as EmbedPDF,
  ZoomMode,
  EmbedPdfContainer,
} from '@embedpdf/snippet';
import { getDocManager } from '../../js/embedpdf-utils.ts';

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

const VIEWER_PROP = '__embedpdfViewer__';

const showPdfViewer = async (files: FileList) => {
  const container = document.getElementById('pdf-viewer-container');
  if (container) {

    let viewer: EmbedPdfContainer | undefined = (container as any)[VIEWER_PROP];
    if (!viewer) {
      // make absolute (works whether vite emits `/assets/...` or a relative path)
      const absolutePdfiumWasmUrl = new URL(pdfiumWasmUrl, location.href).href;
      viewer = EmbedPDF.init({
        type: 'container',
        target: container,
        wasmUrl: absolutePdfiumWasmUrl,
        theme: { preference: isDarkMode() ? 'dark' : 'light' },
        zoom: { defaultZoomLevel: ZoomMode.FitWidth },
      });
      (container as any)[VIEWER_PROP] = viewer;
    }

    const registry = await viewer?.registry;
    if (!registry) {
      showMessage('Failed to load PDF viewer (registry not present).', { type: 'alert' });
      return false;
    }

    const docManager = await getDocManager(registry);
    if (!docManager) {
      showMessage('Failed to load PDF viewer (document manager not present).', { type: 'alert' });
      return false;
    }
    container.classList.remove('hidden');

    // if last doc closes show file upload and hide viewer
    const DOC_CLOSED_FLAG = '__onDocClosedRegistered';
    if (!(container as any)[DOC_CLOSED_FLAG]) {
      docManager.onDocumentClosed(() => {
        const docCount = docManager.getDocumentCount();
        if (docCount <= 0) {
          container.classList.add('hidden');
          toggleToolCard(true);
          console.log('last doc closed, show file upload');
        }
      });
      (container as any)[DOC_CLOSED_FLAG] = true;
    }

    await Promise.all(
      Array.from(files).map(async (f) => {
        const buffer = await f.arrayBuffer();
        return docManager.openDocumentBuffer({ buffer, name: f.name });
      })
    );
    setTimeout(() => scrollTopOfViewer(container));
  } else {
    showMessage('Failed to load PDF viewer (container element not present).', { type: 'alert' });
    return false;
  }
  return true;
};

const scrollTopOfViewer = (viewerEl: HTMLElement) => {
  viewerEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files: FileList) => {
    showProgress('Load PDF file...');
    if (await showPdfViewer(files)) {
      toggleToolCard(false);
    }
    hideProgress();
    showMessage(
      `PDF(s) "${Array.from(files)
        .map((f) => f.name)
        .join(', ')}" loaded.`,
      { timeoutMs: 5000 }
    );
  });
}
