import { setupFileDropzone, downloadFile, downloadAsZip, type DownloadBuffer } from '../../js/file-utils';
import { showMessage, showProgress, hideProgress } from '../../js/ui';
import type { SharedFilesPayload } from '../../js/share-target';
import BackgroundRemovalWorker from './worker?worker';

interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error';
  resultBlob?: Blob;
  resultUrl?: string;
  originalUrl: string;
}

export default function init(payload?: SharedFilesPayload) {
  const gallery = document.getElementById('results-gallery')!;
  const bulkActions = document.getElementById('bulk-actions')!;
  const queueStatus = document.getElementById('queue-status')!;
  const btnClear = document.getElementById('btn-clear')!;
  const btnDownloadAll = document.getElementById('btn-download-all')!;
  const template = document.getElementById('result-item-template') as HTMLTemplateElement;

  // Modal elements
  const previewModal = document.getElementById('preview-modal') as HTMLDialogElement;
  const modalImg = document.getElementById('modal-img') as HTMLImageElement;
  const modalFilename = document.getElementById('modal-filename')!;
  const modalDownload = document.getElementById('modal-download') as HTMLButtonElement;

  let queue: ImageQueueItem[] = [];
  let isProcessing = false;
  let worker: Worker | null = null;


  const updateUI = () => {
    queueStatus.textContent = `${queue.length} images in queue`;
    bulkActions.classList.toggle('hidden', queue.length === 0);
  };

  const initWorker = () => {
    if (!worker) {
      worker = new BackgroundRemovalWorker();
      worker.onmessage = (event) => {
        const { id, status, result, error, progress } = event.data;
        const item = queue.find((i) => i.id === id);
        if (!item) return;

        if (status === 'progress') {
          const statusText = item.element.querySelector('.status-text')!;
          statusText.textContent = `Processing... ${Math.round(progress)}%`;
        } else if (status === 'success') {
          handleSuccess(item, result);
          isProcessing = false;
          processQueue();
        } else if (status === 'error') {
          handleError(item, error);
          isProcessing = false;
          processQueue();
        }
      };
    }
    return worker;
  };

  const handleSuccess = (item: ImageQueueItem, result: Blob) => {
    item.resultBlob = result;
    item.resultUrl = URL.createObjectURL(result);
    item.status = 'done';

    const resultPreview = item.element.querySelector('.result-preview') as HTMLImageElement;
    const statusOverlay = item.element.querySelector('.status-overlay')!;

    resultPreview.src = item.resultUrl;
    statusOverlay.classList.add('hidden');

    item.element.querySelector('.preview-toggle')?.classList.remove('hidden');
    item.element.querySelector('.btn-preview-full')?.classList.remove('hidden');
    item.element.querySelector('.btn-download-item')?.classList.remove('hidden');

    // UI BUG FIX: Trigger the "Processed" button state automatically
    const btnProcessed = item.element.querySelector('.btn-compare-processed') as HTMLButtonElement;
    btnProcessed.click();
  };

  const handleError = (item: ImageQueueItem, error: string) => {
    console.error('Processing error:', error);
    item.status = 'error';
    const statusText = item.element.querySelector('.status-text')!;
    statusText.textContent = 'Error';
    item.element.querySelector('.loading')?.classList.add('hidden');
  };

  const processQueue = async () => {
    if (isProcessing) return;

    const item = queue.find((i) => i.status === 'pending');
    if (!item) {
      updateUI();
      return;
    }

    isProcessing = true;
    item.status = 'processing';
    const statusText = item.element.querySelector('.status-text')!;
    statusText.textContent = 'Removing background...';

    const w = initWorker();
    w.postMessage({ id: item.id, file: item.file });

    updateUI();
  };

  const addFilesToQueue = (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const id = Math.random().toString(36).substring(2, 9);
      const originalUrl = URL.createObjectURL(file);

      const clone = template.content.cloneNode(true) as DocumentFragment;
      const container = clone.querySelector('.card') as HTMLElement;

      container.querySelector('.filename')!.textContent = file.name;
      container.querySelector('.filesize')!.textContent = `${(file.size / 1024).toFixed(1)} KB`;

      const originalPreview = container.querySelector('.original-preview') as HTMLImageElement;
      const resultPreview = container.querySelector('.result-preview') as HTMLImageElement;
      originalPreview.src = originalUrl;

      // Toggle logic
      const btnOriginal = container.querySelector('.btn-compare-original') as HTMLButtonElement;
      const btnProcessed = container.querySelector('.btn-compare-processed') as HTMLButtonElement;

      btnOriginal.onclick = () => {
        originalPreview.classList.remove('opacity-0');
        resultPreview.classList.add('opacity-0');
        btnOriginal.classList.add('btn-primary');
        btnProcessed.classList.remove('btn-primary');
      };

      btnProcessed.onclick = () => {
        originalPreview.classList.add('opacity-0');
        resultPreview.classList.remove('opacity-0');
        btnProcessed.classList.add('btn-primary');
        btnOriginal.classList.remove('btn-primary');
      };

      // Remove item logic
      (container.querySelector('.btn-remove-item') as HTMLElement).onclick = () => {
        const index = queue.findIndex(item => item.id === id);
        if (index !== -1) {
          const item = queue[index];
          if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
          URL.revokeObjectURL(item.originalUrl);
          queue.splice(index, 1);
        }
        container.remove();
        updateUI();
      };

      // Download logic
      const btnDownload = container.querySelector('.btn-download-item') as HTMLButtonElement;
      btnDownload.onclick = () => {
        const item = queue.find(it => it.id === id);
        if (item?.resultBlob) {
          downloadFile(item.resultBlob, `${file.name.replace(/\.[^/.]+$/, '')}-no-bg.png`);
        }
      };

      // Preview logic
      const btnPreview = container.querySelector('.btn-preview-full') as HTMLButtonElement;
      btnPreview.onclick = () => {
        const item = queue.find(it => it.id === id);
        if (item?.resultUrl) {
          modalImg.src = item.resultUrl;
          modalFilename.textContent = file.name;
          modalDownload.onclick = () => btnDownload.click();
          previewModal.showModal();
        }
      };

      gallery.appendChild(container);

      queue.push({
        id,
        file,
        element: container,
        status: 'pending',
        originalUrl
      });
    }
    updateUI();
    processQueue();
  };

  // Wire up dropzone
  setupFileDropzone('dropzone', 'image-input', addFilesToQueue);

  // Wire up bulk actions
  btnClear.addEventListener('click', () => {
    queue.forEach((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      URL.revokeObjectURL(item.originalUrl);
      item.element.remove();
    });
    queue = [];
    updateUI();
  });

  btnDownloadAll.addEventListener('click', async () => {
    const doneItems = queue.filter((i) => i.status === 'done' && i.resultBlob);
    if (doneItems.length === 0) {
      showMessage('No images processed yet.', { type: 'warning' });
      return;
    }

    showProgress('Preparing ZIP...');
    try {
      const zipFiles: DownloadBuffer[] = await Promise.all(doneItems.map(async (item) => ({
        data: await item.resultBlob!.arrayBuffer(),
        name: `${item.file.name.replace(/\.[^/.]+$/, '')}-no-bg.png`,
      })));

      await downloadAsZip(zipFiles, 'background-removed-images.zip');
    } catch (e) {
      showMessage('Failed to create ZIP file.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  // Handle shared files
  if (payload?.sharedFiles?.length) {
    addFilesToQueue(payload.sharedFiles);
  }

  return () => {
    // Cleanup
    if (worker) {
      worker.terminate();
      worker = null;
    }
    queue.forEach((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      URL.revokeObjectURL(item.originalUrl);
    });
  };
}
