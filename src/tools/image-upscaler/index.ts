import {
  setupFileDropzone,
  retrieveImageBlobFromClipboard,
  downloadFile,
  downloadAsZip,
  type DownloadBuffer,
} from '../../js/file-utils';
import { showMessage, showProgress, hideProgress } from '../../js/ui';
import type { SharedFilesPayload } from '../../js/share-target';
import UpscalerWorker from './worker?worker';

interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error';
  originalUrl: string;
  resultUrl?: string;
  resultBlob?: Blob;
  formattedSize: string;
  options: { model: string };
}

export default function init(payload?: SharedFilesPayload) {
  const pasteBtn = document.getElementById('paste-btn') as HTMLButtonElement;
  const configModel = document.getElementById('config-model') as HTMLSelectElement;

  const gallery = document.getElementById('results-gallery')!;
  const bulkActions = document.getElementById('bulk-actions')!;
  const queueStatus = document.getElementById('queue-status')!;
  const queueBadge = document.getElementById('queue-progress-badge')!;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnDownloadAll = document.getElementById('btn-download-all') as HTMLButtonElement;
  const template = document.getElementById('result-item-template') as HTMLTemplateElement;

  let queue: ImageQueueItem[] = [];
  let isProcessing = false;
  let worker: Worker | null = null;

  const updateUI = () => {
    const total = queue.length;
    const done = queue.filter((i) => i.status === 'done').length;
    const errors = queue.filter((i) => i.status === 'error').length;
    const processing = queue.filter((i) => i.status === 'processing').length;

    bulkActions.classList.toggle('hidden', total === 0);

    if (total === 0) {
      queueStatus.textContent = '0 images';
      queueBadge.classList.add('hidden');
      return;
    }

    queueStatus.textContent = `${total} image${total !== 1 ? 's' : ''}`;

    if (done === total) {
      queueBadge.textContent = '✓ All done';
      queueBadge.className = 'badge badge-sm badge-success';
    } else if (errors > 0 && done + errors === total) {
      queueBadge.textContent = `${done} done, ${errors} failed`;
      queueBadge.className = 'badge badge-sm badge-warning';
    } else if (processing > 0) {
      queueBadge.textContent = `${done}/${total} processed`;
      queueBadge.className = 'badge badge-sm badge-info';
    } else {
      queueBadge.textContent = `${done}/${total} processed`;
      queueBadge.className = 'badge badge-sm badge-ghost';
    }
    queueBadge.classList.remove('hidden');
  };

  const getOutputFilename = (originalName: string) => {
    const parts = originalName.split('.');
    parts.pop();
    const base = parts.join('.') || 'image';
    return `${base}-upscaled.png`;
  };

  const initWorker = () => {
    if (!worker) {
      worker = new UpscalerWorker();
      worker.onmessage = (event) => {
        const { type, payload } = event.data;
        const item = queue.find((i) => i.id === payload.id);
        if (!item) return;

        if (type === 'PROGRESS') {
          const statusText = item.element.querySelector('.status-text')!;
          const progressBar = item.element.querySelector('.item-progress') as HTMLProgressElement;
          statusText.textContent = payload.status;
          if (progressBar) progressBar.value = Math.round(payload.progress);
        } else if (type === 'RESULT') {
          handleSuccess(item, payload.blob as Blob);
          isProcessing = false;
          processQueue();
        } else if (type === 'ERROR') {
          handleError(item, payload.error);
          isProcessing = false;
          processQueue();
        }
      };
    }
    return worker;
  };

  const handleSuccess = (item: ImageQueueItem, result: Blob) => {
    item.resultBlob = result;
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    item.resultUrl = URL.createObjectURL(result);
    item.status = 'done';

    const resultPreview = item.element.querySelector('.result-preview') as HTMLImageElement;
    const statusOverlay = item.element.querySelector('.status-overlay')!;
    const originalPreview = item.element.querySelector('.original-preview') as HTMLImageElement;

    originalPreview.classList.add('opacity-0');
    resultPreview.classList.remove('opacity-0');
    resultPreview.src = item.resultUrl;
    statusOverlay.classList.add('hidden');

    item.element.querySelector('.preview-toggle')?.classList.remove('hidden');
    item.element.querySelector('.done-badge')?.classList.remove('hidden');
    item.element.querySelector('.btn-download-item')?.classList.remove('hidden');
    item.element.querySelector('.btn-copy-item')?.classList.remove('hidden');
    item.element.querySelector('.btn-compare-processed')?.classList.add('btn-primary');
    item.element.querySelector('.btn-compare-original')?.classList.remove('btn-primary');

    updateUI();
  };

  const handleError = (item: ImageQueueItem, error: string) => {
    console.error('Processing error:', error);
    item.status = 'error';
    const statusOverlay = item.element.querySelector('.status-overlay')!;
    const statusText = item.element.querySelector('.status-text')!;
    const progressBar = item.element.querySelector('.item-progress') as HTMLProgressElement;
    const spinner = item.element.querySelector('.loading') as HTMLElement | null;

    const shortError = error && error.length > 80 ? error.substring(0, 80) + '…' : error || 'Unknown error';
    statusText.innerHTML = `<span class="text-error font-bold">Error</span><br/><span class="text-xs opacity-70 mt-1 block">${shortError}</span>`;

    if (progressBar) progressBar.classList.add('hidden');
    if (spinner) spinner.classList.add('hidden');
    statusOverlay.classList.remove('hidden');

    let retryBtn = statusOverlay.querySelector('.btn-retry') as HTMLButtonElement | null;
    if (!retryBtn) {
      retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-xs btn-primary mt-2 btn-retry';
      retryBtn.textContent = 'Retry';
      statusOverlay.appendChild(retryBtn);
    }
    retryBtn.classList.remove('hidden');
    retryBtn.onclick = () => {
      retryBtn!.classList.add('hidden');
      item.status = 'pending';
      if (spinner) spinner.classList.remove('hidden');
      if (progressBar) {
        progressBar.classList.remove('hidden');
        progressBar.value = 0;
      }
      statusText.textContent = 'Pending...';
      processQueue();
    };

    updateUI();
  };

  const processQueue = async () => {
    if (isProcessing) return;
    const item = queue.find((i) => i.status === 'pending');
    if (!item) {
      updateUI();
      return;
    }

    try {
      isProcessing = true;
      item.status = 'processing';
      const statusText = item.element.querySelector('.status-text')!;
      statusText.textContent = 'Starting AI model...';

      const w = initWorker();
      w.postMessage({ type: 'PROCESS', payload: { id: item.id, blob: item.file, model: item.options.model } });
      updateUI();
    } catch (err) {
      console.error('Failed to start processing:', err);
      handleError(item, (err as Error).message);
      isProcessing = false;
      processQueue();
    }
  };

  const addFilesToQueue = (files: FileList | File[]) => {
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const id = Math.random().toString(36).substring(2, 9);
        const originalUrl = URL.createObjectURL(file);

        const clone = template.content.cloneNode(true) as DocumentFragment;
        const card = clone.querySelector('.card') as HTMLElement;
        if (!card) continue;

        const filenameEl = card.querySelector('.filename');
        if (filenameEl) filenameEl.textContent = file.name;

        const formattedSize = `${(file.size / 1024).toFixed(1)} KB`;
        const filesizeEl = card.querySelector('.filesize');
        if (filesizeEl) filesizeEl.textContent = formattedSize;

        const originalPreview = card.querySelector('.original-preview') as HTMLImageElement;
        const resultPreview = card.querySelector('.result-preview') as HTMLImageElement;
        if (originalPreview) originalPreview.src = originalUrl;

        const btnOriginal = card.querySelector('.btn-compare-original') as HTMLButtonElement;
        const btnProcessed = card.querySelector('.btn-compare-processed') as HTMLButtonElement;

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

        const btnRemove = card.querySelector('.btn-remove-item') as HTMLElement;
        btnRemove.onclick = () => {
          const index = queue.findIndex((item) => item.id === id);
          if (index !== -1) {
            const item = queue[index];
            if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
            URL.revokeObjectURL(item.originalUrl);
            queue.splice(index, 1);
          }
          card.remove();
          updateUI();
        };

        const btnDownload = card.querySelector('.btn-download-item') as HTMLButtonElement;
        btnDownload.onclick = () => {
          const item = queue.find((it) => it.id === id);
          if (item?.resultBlob) {
            downloadFile(item.resultBlob, getOutputFilename(file.name));
          }
        };

        const btnCopy = card.querySelector('.btn-copy-item') as HTMLButtonElement;
        btnCopy.onclick = async () => {
          const item = queue.find((it) => it.id === id);
          if (item?.resultBlob) {
            const pngBlob = new Blob([item.resultBlob], { type: 'image/png' });
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': pngBlob }),
            ]);
          }
        };

        gallery.appendChild(card);
        queue.push({
          id,
          file,
          element: card,
          status: 'pending',
          originalUrl,
          formattedSize,
          options: { model: configModel.value }
        });
      }

      if (files.length > 0) {
        // Yield to allow rendering
        setTimeout(() => {
          gallery?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }

      updateUI();
      processQueue();
    } catch (err) {
      console.error('Error adding files to queue:', err);
      showMessage('Failed to add some files.', { type: 'alert' });
    }
  };

  setupFileDropzone('dropzone', 'image-input', addFilesToQueue);

  pasteBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imageBlob = await retrieveImageBlobFromClipboard();
    if (imageBlob) {
      addFilesToQueue([new File([imageBlob], `pasted-image-${Date.now()}.png`, { type: imageBlob.type })]);
    } else {
      showMessage('No image found in clipboard.', { type: 'info', timeoutMs: 3000 });
    }
  });

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
      showMessage('No items to download.', { type: 'warning' });
      return;
    }

    showProgress('Preparing ZIP...');
    try {
      const zipFiles: DownloadBuffer[] = await Promise.all(
        doneItems.map(async (item) => ({
          data: await item.resultBlob!.arrayBuffer(),
          name: getOutputFilename(item.file.name),
        }))
      );
      await downloadAsZip(zipFiles, 'upscaled-images.zip');
    } catch (e) {
      showMessage('Failed to create ZIP.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  if (payload?.sharedFiles?.length) addFilesToQueue(payload.sharedFiles);

  return () => {
    if (worker) worker.terminate();
    queue.forEach((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      URL.revokeObjectURL(item.originalUrl);
    });
  };
}
