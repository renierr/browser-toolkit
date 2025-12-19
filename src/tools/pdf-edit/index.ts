import { setupFileDropzone } from '../../js/file-utils.ts';
import { openPdfInViewerFrame } from '../../js/pdf-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's asset handling to resolve the worker path
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const showPdfViewerFrame = (blobUrl: string ) => {
  const pdfViewerContainer = document.getElementById('pdf-viewer-container');
  const iframe = document.getElementById('pdf-viewer-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    showMessage('Failed to load PDF viewer (iFrame no present).', { type: 'alert' });
    return
  }
  pdfViewerContainer?.classList.remove('hidden');
  openPdfInViewerFrame(iframe, blobUrl);

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

// toggle maximize / fullscreen with fallback to CSS class
const toggleIframeMaximize = async () => {
  const iframe = document.getElementById('pdf-viewer-iframe') as HTMLIFrameElement | null;
  const btn = document.getElementById('pdf-maximize-btn') as HTMLButtonElement | null;
  if (!iframe) return;

  iframe.classList.toggle('pdf-maximized');
  document.body.classList.toggle('no-scroll');
  const isMax =
    document.fullscreenElement === iframe || iframe.classList.contains('pdf-maximized');
  if (btn) btn.textContent = isMax ? '⤡' : '⤢';
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


  const maxBtn = document.getElementById('pdf-maximize-btn') as HTMLButtonElement | null;
  if (maxBtn) {
    maxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleIframeMaximize();
    });
  }
}
