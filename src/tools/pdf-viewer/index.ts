import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import pdfiumWasmUrl from '@embedpdf/snippet/dist/pdfium.wasm?url';
import { isDarkMode } from '../../js/theme.ts';
import {
  default as EmbedPDF,
  type PluginRegistry,
  type DocumentManagerPlugin,
  ZoomMode,
} from '@embedpdf/snippet';

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

const getDocManager = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof DocumentManagerPlugin>>('document-manager')
    ?.provides();
};

const showPdfViewer = async (files: FileList) => {
  const container = document.getElementById('pdf-viewer-container');
  if (container) {

    // make absolute (works whether vite emits `/assets/...` or a relative path)
    const absolutePdfiumWasmUrl = new URL(pdfiumWasmUrl, location.href).href;
    const viewer = EmbedPDF.init({
      type: 'container',
      target: container,
      wasmUrl: absolutePdfiumWasmUrl,
      theme: { preference: isDarkMode() ? 'dark' : 'system' },
      zoom: { defaultZoomLevel: ZoomMode.FitWidth },
    });

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
