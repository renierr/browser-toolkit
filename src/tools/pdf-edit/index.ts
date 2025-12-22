import { setupFileDropzone } from '../../js/file-utils.ts';
import { injectMaximizeToViewerFrame, openPdfInViewerFrame } from '../../js/pdf-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';

// dynamic importing of large pdf libs to reduce chunk size and loading time
const pdfjsLib = await import('pdfjs-dist');
const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default ?? workerModule;

const showPdfViewerFrame = (blobUrl: string) => {
  const pdfViewerContainer = document.getElementById('pdf-viewer-container');
  const iframe = document.getElementById('pdf-viewer-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    showMessage('Failed to load PDF viewer (iFrame no present).', { type: 'alert' });
    return;
  }
  pdfViewerContainer?.classList.remove('hidden');
  openPdfInViewerFrame(iframe, blobUrl);
  injectMaximizeToViewerFrame(iframe);
};

const toggleToolCard = (show: boolean) => {
  const toolCardElement = document.getElementById('pdf-edit-tool-card');
  if (!toolCardElement) return;
  if (show) {
    toolCardElement.classList.remove('hidden');
  } else {
    toolCardElement.classList.add('hidden');
  }
};

export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (file) => {
    showProgress('Load PDF file...');
    const arrayBuffer = await file.arrayBuffer();

    // create blob URL and post to iframe viewer
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    showPdfViewerFrame(blobUrl);
    toggleToolCard(false);
    hideProgress();
    showMessage(`PDF ${file.name} loaded.`, { timeoutMs: 5000 });
  });
}
