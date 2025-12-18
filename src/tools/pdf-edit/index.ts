import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's asset handling to resolve the worker path
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const viewerUrl = '/pdfjs/web/viewer.html';

const showPdfViewerFrame = (blobUrl: string ) => {
  const iframe = document.getElementById('pdf-viewer-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    showMessage('Failed to load PDF viewer (iFrame no present).', { type: 'alert' });
    return
  }

  iframe.classList.remove('hidden');
  iframe.src = `${viewerUrl}?file=${encodeURIComponent(blobUrl)}#page=1`;

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
