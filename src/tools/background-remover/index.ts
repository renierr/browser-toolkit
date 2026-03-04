import { setupFileDropzone, downloadFile, downloadAsZip, type DownloadBuffer } from '../../js/file-utils';
import { showMessage, showProgress, hideProgress } from '../../js/ui';
import type { SharedFilesPayload } from '../../js/share-target';
import BackgroundRemovalWorker from './worker?worker';

const MODEL_URL = new URL('./lib/models/u2netp-q.onnx', document.baseURI).href;

interface ProcessingOptions {
  threshold: number;
  smoothing: number;
}

interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error';
  resultBlob?: Blob;
  resultUrl?: string;
  originalUrl: string;
}

function getSelectedFormat(): 'png' | 'webp' {
  const radio = document.querySelector<HTMLInputElement>('input[name="download-format"]:checked');
  return (radio?.value as 'png' | 'webp') || 'png';
}

function getWebpQuality(): number {
  const el = document.getElementById('opt-quality') as HTMLInputElement | null;
  return el ? parseInt(el.value, 10) / 100 : 0.92;
}

function getProcessingOptions(): ProcessingOptions {
  const threshold = parseInt((document.getElementById('opt-threshold') as HTMLInputElement)?.value ?? '128', 10);
  const smoothing = parseInt((document.getElementById('opt-smooth') as HTMLInputElement)?.value ?? '4', 10);
  return { threshold, smoothing };
}

async function convertBlobToFormat(blob: Blob, format: 'png' | 'webp', quality: number): Promise<Blob> {
  if (format === 'png') return blob;
  // Convert PNG blob to WebP using OffscreenCanvas
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/webp', quality });
}

async function copyBlobToClipboard(blob: Blob): Promise<void> {
  showProgress('Copying to clipboard...');
  try {
    // Clipboard API requires PNG
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    }
    await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
    showMessage('Copied to clipboard!', { type: 'info', timeoutMs: 2000 });
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showMessage('Failed to copy to clipboard.', { type: 'alert' });
  } finally {
    hideProgress();
  }
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const gallery = document.getElementById('results-gallery')!;
  const bulkActions = document.getElementById('bulk-actions')!;
  const queueStatus = document.getElementById('queue-status')!;
  const queueBadge = document.getElementById('queue-progress-badge')!;
  const btnClear = document.getElementById('btn-clear')!;
  const btnDownloadAll = document.getElementById('btn-download-all')!;
  const template = document.getElementById('result-item-template') as HTMLTemplateElement;

  // Modal elements
  const previewModal = document.getElementById('preview-modal') as HTMLDialogElement;
  const modalImg = document.getElementById('modal-img') as HTMLImageElement;
  const modalFilename = document.getElementById('modal-filename')!;
  const modalDownload = document.getElementById('modal-download') as HTMLButtonElement;
  const modalCopy = document.getElementById('modal-copy') as HTMLButtonElement;

  // Options range labels
  const optThreshold = document.getElementById('opt-threshold') as HTMLInputElement | null;
  const optThresholdValue = document.getElementById('opt-threshold-value');
  const optSmooth = document.getElementById('opt-smooth') as HTMLInputElement | null;
  const optSmoothValue = document.getElementById('opt-smooth-value');
  const optQuality = document.getElementById('opt-quality') as HTMLInputElement | null;
  const optQualityValue = document.getElementById('opt-quality-value');

  // Wire up option labels
  optThreshold?.addEventListener('input', () => {
    if (optThresholdValue) optThresholdValue.textContent = optThreshold.value;
  });
  optSmooth?.addEventListener('input', () => {
    if (optSmoothValue) optSmoothValue.textContent = optSmooth.value;
  });
  optQuality?.addEventListener('input', () => {
    if (optQualityValue) optQualityValue.textContent = `${optQuality.value}%`;
  });

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

  const initWorker = () => {
    if (!worker) {
      worker = new BackgroundRemovalWorker();
      worker.onmessage = (event) => {
        const { id, status, result, error, progress } = event.data;
        const item = queue.find((i) => i.id === id);
        if (!item) return;

        if (status === 'progress') {
          const statusText = item.element.querySelector('.status-text')!;
          const progressBar = item.element.querySelector('.item-progress') as HTMLProgressElement;
          const stepText = event.data.step ? ` (${event.data.step})` : '';
          statusText.textContent = `Processing${stepText}... ${Math.round(progress)}%`;
          if (progressBar) progressBar.value = Math.round(progress);
        } else if (status === 'success') {
          handleSuccess(item, result, event.data.width, event.data.height);
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

  const handleSuccess = (item: ImageQueueItem, result: Blob, width?: number, height?: number) => {
    item.resultBlob = result;
    item.resultUrl = URL.createObjectURL(result);
    item.status = 'done';

    const resultPreview = item.element.querySelector('.result-preview') as HTMLImageElement;
    const statusOverlay = item.element.querySelector('.status-overlay')!;

    resultPreview.src = item.resultUrl;
    statusOverlay.classList.add('hidden');

    if (width && height) {
      const sizeInfo = item.element.querySelector('.filesize')!;
      sizeInfo.textContent = `${sizeInfo.textContent} • ${width}x${height}`;
    }

    item.element.querySelector('.preview-toggle')?.classList.remove('hidden');
    item.element.querySelector('.done-badge')?.classList.remove('hidden');
    item.element.querySelector('.btn-preview-full')?.classList.remove('hidden');
    item.element.querySelector('.btn-download-item')?.classList.remove('hidden');
    item.element.querySelector('.btn-copy-item')?.classList.remove('hidden');

    // UI BUG FIX: Trigger the "Processed" button state automatically
    const btnProcessed = item.element.querySelector('.btn-compare-processed') as HTMLButtonElement;
    btnProcessed.click();

    updateUI();
  };

  const handleError = (item: ImageQueueItem, error: string) => {
    console.error('Processing error:', error);
    item.status = 'error';
    const statusText = item.element.querySelector('.status-text')!;
    const progressBar = item.element.querySelector('.item-progress') as HTMLProgressElement;
    statusText.textContent = 'Error';
    if (progressBar) progressBar.classList.add('hidden');
    item.element.querySelector('.loading')?.classList.add('hidden');

    updateUI();
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

    const options = getProcessingOptions();
    const w = initWorker();
    w.postMessage({ id: item.id, file: item.file, modelUrl: MODEL_URL, options });

    updateUI();
  };

  const getOutputFilename = (originalName: string, format: 'png' | 'webp') => {
    return `${originalName.replace(/\.[^/.]+$/, '')}-no-bg.${format}`;
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
      btnDownload.onclick = async () => {
        const item = queue.find(it => it.id === id);
        if (item?.resultBlob) {
          const format = getSelectedFormat();
          const quality = getWebpQuality();
          const outputBlob = await convertBlobToFormat(item.resultBlob, format, quality);
          downloadFile(outputBlob, getOutputFilename(file.name, format));
        }
      };

      // Copy to clipboard logic
      const btnCopy = container.querySelector('.btn-copy-item') as HTMLButtonElement;
      btnCopy.onclick = async () => {
        const item = queue.find(it => it.id === id);
        if (item?.resultBlob) {
          await copyBlobToClipboard(item.resultBlob);
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
          modalCopy.onclick = async () => {
            if (item.resultBlob) await copyBlobToClipboard(item.resultBlob);
          };
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

    const format = getSelectedFormat();
    const quality = getWebpQuality();

    showProgress('Preparing ZIP...');
    try {
      const zipFiles: DownloadBuffer[] = await Promise.all(doneItems.map(async (item) => {
        const outputBlob = await convertBlobToFormat(item.resultBlob!, format, quality);
        return {
          data: await outputBlob.arrayBuffer(),
          name: getOutputFilename(item.file.name, format),
        };
      }));

      await downloadAsZip(zipFiles, `background-removed-images.zip`);
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
