import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';

// dynamic importing of large pdf libs to reduce chunk size and loading time
const pdfjsLib = await import('pdfjs-dist');
const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default ?? workerModule;

export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (file) => {
    showProgress('Load PDF file...');
    const arrayBuffer = await file.arrayBuffer();

    // create blob URL and post to iframe viewer
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    hideProgress();
    showMessage(`PDF ${file.name} loaded.`, { timeoutMs: 5000 });
  });
}
