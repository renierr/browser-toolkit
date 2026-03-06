import { downloadAsZip, type DownloadBuffer, downloadFile, retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils';
import { hideProgress, showMessage, showProgress } from '../../js/ui';
import { debounce } from '../../js/utils';
import { convertBlobFormat, copyImageBlobToClipboard } from '../../js/image-utils';
import type { SharedFilesPayload } from '../../js/share-target';
import BackgroundRemovalWorker from './worker?worker';

const MODEL_URL = new URL('./lib/models/u2netp-q.onnx', document.baseURI).href;

interface ProcessingOptions {
  threshold: number;
  smoothing: number;
  contrast: number;
  useGuidedFilter: boolean;
}

interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error';
  resultBlob?: Blob;
  resultUrl?: string;
  originalUrl: string;
  rawMask?: Float32Array;
  formattedSize: string;
  width?: number;
  height?: number;
  options: ProcessingOptions;
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
  const contrast = parseFloat((document.getElementById('opt-contrast') as HTMLInputElement)?.value ?? '1.0');
  const useGuidedFilter = (document.getElementById('opt-refine') as HTMLInputElement)?.checked ?? false;
  return { threshold, smoothing, contrast, useGuidedFilter };
}

async function convertBlobToFormat(blob: Blob, format: 'png' | 'webp', quality: number): Promise<Blob> {
  if (format === 'png') return blob;
  return convertBlobFormat(blob, 'image/webp', quality);
}

async function copyBlobToClipboard(blob: Blob): Promise<void> {
  showProgress('Copying to clipboard...');
  try {
    await copyImageBlobToClipboard(blob);
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
  const pasteBtn = document.getElementById('paste-btn')!;

  // Modal elements
  const previewModal = document.getElementById('preview-modal') as HTMLDialogElement;
  const modalImg = document.getElementById('modal-img') as HTMLImageElement;
  const modalFilename = document.getElementById('modal-filename')!;
  const modalDownload = document.getElementById('modal-download') as HTMLButtonElement;
  const modalCopy = document.getElementById('modal-copy') as HTMLButtonElement;

  const modalThresholdSlider = previewModal.querySelector(
    '.modal-threshold-slider'
  ) as HTMLInputElement;
  const modalSmoothSlider = previewModal.querySelector('.modal-smooth-slider') as HTMLInputElement;
  const modalContrastSlider = previewModal.querySelector(
    '.modal-contrast-slider'
  ) as HTMLInputElement;
  const modalRefineToggle = previewModal.querySelector('.modal-refine-toggle') as HTMLInputElement;

  const modalThresholdVal = previewModal.querySelector('.modal-threshold-val')!;
  const modalSmoothVal = previewModal.querySelector('.modal-smooth-val')!;
  const modalContrastVal = previewModal.querySelector('.modal-contrast-val')!;
  const modalStatusOverlay = document.getElementById('modal-status-overlay')!;

  // Modal view mode
  const modalOutlineCanvas = document.getElementById('modal-outline-canvas') as HTMLCanvasElement;
  const btnViewProcessed = previewModal.querySelector('.modal-view-processed') as HTMLButtonElement;
  const btnViewOriginal = previewModal.querySelector('.modal-view-original') as HTMLButtonElement;
  const btnViewOutline = previewModal.querySelector('.modal-view-outline') as HTMLButtonElement;
  let modalViewMode: 'processed' | 'original' | 'outline' = 'processed';

  // Options range labels
  const optThreshold = document.getElementById('opt-threshold') as HTMLInputElement | null;
  const optThresholdValue = document.getElementById('opt-threshold-value');
  const optSmooth = document.getElementById('opt-smooth') as HTMLInputElement | null;
  const optSmoothValue = document.getElementById('opt-smooth-value');
  const optQuality = document.getElementById('opt-quality') as HTMLInputElement | null;
  const optQualityValue = document.getElementById('opt-quality-value');
  const optContrast = document.getElementById('opt-contrast') as HTMLInputElement | null;
  const optContrastValue = document.getElementById('opt-contrast-value');

  optThreshold?.addEventListener('input', () => {
    if (optThresholdValue) optThresholdValue.textContent = optThreshold.value;
  });
  optSmooth?.addEventListener('input', () => {
    if (optSmoothValue) optSmoothValue.textContent = optSmooth.value;
  });
  optQuality?.addEventListener('input', () => {
    if (optQualityValue) optQualityValue.textContent = `${optQuality.value}%`;
  });
  optContrast?.addEventListener('input', () => {
    if (optContrastValue) optContrastValue.textContent = optContrast.value;
  });

  let queue: ImageQueueItem[] = [];
  let isProcessing = false;
  let worker: Worker | null = null;
  let currentModalItemId: string | null = null;
  let pendingReprocess: Map<string, ProcessingOptions> = new Map();
  let reprocessDebouncers: Map<
    string,
    ReturnType<typeof debounce<(options: ProcessingOptions) => void>>
  > = new Map();

  /**
   * Render the raw mask as a coloured outline overlay onto the modal canvas.
   * The mask is 320x320 Float32Array; we normalize, resize to image dimensions,
   * then draw only edge pixels (via a simple Sobel-like gradient magnitude threshold).
   */
  const renderOutlineToCanvas = (item: ImageQueueItem) => {
    if (!item.rawMask || !item.width || !item.height) {
      modalOutlineCanvas.classList.add('hidden');
      return;
    }

    const MODEL_SIZE = 320;
    const raw = item.rawMask;
    const w = item.width;
    const h = item.height;

    // Normalize raw mask to 0-255
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] < min) min = raw[i];
      if (raw[i] > max) max = raw[i];
    }
    const range = max - min || 1;
    const norm = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      norm[i] = (raw[i] - min) / range;
    }

    // Resize mask from MODEL_SIZE x MODEL_SIZE to image dimensions using bilinear interpolation
    const resized = new Float32Array(w * h);
    const xRatio = MODEL_SIZE / w;
    const yRatio = MODEL_SIZE / h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcX = x * xRatio;
        const srcY = y * yRatio;
        const x0 = Math.min(Math.floor(srcX), MODEL_SIZE - 1);
        const y0 = Math.min(Math.floor(srcY), MODEL_SIZE - 1);
        const x1 = Math.min(x0 + 1, MODEL_SIZE - 1);
        const y1 = Math.min(y0 + 1, MODEL_SIZE - 1);
        const fx = srcX - x0;
        const fy = srcY - y0;

        resized[y * w + x] =
          norm[y0 * MODEL_SIZE + x0] * (1 - fx) * (1 - fy) +
          norm[y0 * MODEL_SIZE + x1] * fx * (1 - fy) +
          norm[y1 * MODEL_SIZE + x0] * (1 - fx) * fy +
          norm[y1 * MODEL_SIZE + x1] * fx * fy;
      }
    }

    // Compute gradient magnitude (Sobel-like) and draw edges
    modalOutlineCanvas.width = w;
    modalOutlineCanvas.height = h;
    const ctx = modalOutlineCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const edgeThreshold = 0.08;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx = resized[y * w + (x + 1)] - resized[y * w + (x - 1)];
        const gy = resized[(y + 1) * w + x] - resized[(y - 1) * w + x];
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > edgeThreshold) {
          const idx = (y * w + x) * 4;
          // Bright cyan outline with intensity based on gradient
          const a = Math.min(255, Math.round(mag * 4 * 255));
          data[idx] = 0; // R
          data[idx + 1] = 220; // G
          data[idx + 2] = 255; // B
          data[idx + 3] = a; // A
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Position the canvas to exactly overlay the rendered image
    positionOutlineCanvas();
    modalOutlineCanvas.classList.remove('hidden');
  };

  /** Position the outline canvas to match the modal image's rendered bounding box */
  const positionOutlineCanvas = () => {
    const imgRect = modalImg.getBoundingClientRect();
    const parentRect = modalImg.parentElement!.getBoundingClientRect();
    modalOutlineCanvas.style.left = `${imgRect.left - parentRect.left}px`;
    modalOutlineCanvas.style.top = `${imgRect.top - parentRect.top}px`;
    modalOutlineCanvas.style.width = `${imgRect.width}px`;
    modalOutlineCanvas.style.height = `${imgRect.height}px`;
  };

  /** Switch the modal between processed, original, and outline views */
  const setModalViewMode = (mode: 'processed' | 'original' | 'outline') => {
    modalViewMode = mode;
    const item = queue.find((it) => it.id === currentModalItemId);

    // Update toggle button styles
    btnViewProcessed.classList.toggle('btn-primary', mode === 'processed');
    btnViewOriginal.classList.toggle('btn-primary', mode === 'original');
    btnViewOutline.classList.toggle('btn-primary', mode === 'outline');

    if (!item) return;

    if (mode === 'original') {
      modalImg.src = item.originalUrl;
      modalOutlineCanvas.classList.add('hidden');
    } else if (mode === 'outline') {
      modalImg.src = item.originalUrl;
      renderOutlineToCanvas(item);
    } else {
      modalImg.src = item.resultUrl || item.originalUrl;
      modalOutlineCanvas.classList.add('hidden');
    }
  };

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
          handleSuccess(item, result, event.data.width, event.data.height, event.data.rawMask);
          isProcessing = false;
          flushPendingReprocess();
          processQueue();
        } else if (status === 'error') {
          handleError(item, error);
          isProcessing = false;
          flushPendingReprocess();
          processQueue();
        }
      };
    }
    return worker;
  };

  const handleSuccess = (
    item: ImageQueueItem,
    result: Blob,
    width?: number,
    height?: number,
    rawMask?: Float32Array
  ) => {
    item.resultBlob = result;
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    item.resultUrl = URL.createObjectURL(result);
    item.status = 'done';
    if (rawMask) item.rawMask = rawMask;

    const resultPreview = item.element.querySelector('.result-preview') as HTMLImageElement;
    const statusOverlay = item.element.querySelector('.status-overlay')!;

    const originalPreview = item.element.querySelector('.original-preview') as HTMLImageElement;
    originalPreview.classList.add('opacity-0');
    resultPreview.classList.remove('opacity-0');
    resultPreview.src = item.resultUrl;
    statusOverlay.classList.add('hidden');

    if (item.id === currentModalItemId) {
      if (modalViewMode === 'processed') {
        modalImg.src = item.resultUrl;
      } else if (modalViewMode === 'outline') {
        renderOutlineToCanvas(item);
      }
      // 'original' mode doesn't need updating
      modalStatusOverlay.classList.add('hidden');
    }

    if (width && height) {
      item.width = width;
      item.height = height;
      const sizeInfo = item.element.querySelector('.filesize')!;
      sizeInfo.textContent = `${item.formattedSize} • ${width}x${height}`;
    }

    item.element.querySelector('.preview-toggle')?.classList.remove('hidden');
    item.element.querySelector('.done-badge')?.classList.remove('hidden');
    item.element.querySelector('.btn-preview-full')?.classList.remove('hidden');
    item.element.querySelector('.btn-download-item')?.classList.remove('hidden');
    item.element.querySelector('.btn-copy-item')?.classList.remove('hidden');
    item.element.querySelector('.btn-settings-item')?.classList.remove('hidden');
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

    // Show a meaningful error message (truncated for UI)
    const shortError =
      error && error.length > 80 ? error.substring(0, 80) + '…' : error || 'Unknown error';
    statusText.innerHTML = `<span class="text-error font-bold">Error</span><br/><span class="text-xs opacity-70 mt-1 block">${shortError}</span>`;
    if (progressBar) progressBar.classList.add('hidden');
    if (spinner) spinner.classList.add('hidden');
    statusOverlay.classList.remove('hidden');

    // Add a retry button if not already present
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
      const resetSpinner = item.element.querySelector('.loading') as HTMLElement | null;
      if (resetSpinner) resetSpinner.classList.remove('hidden');
      if (progressBar) {
        progressBar.classList.remove('hidden');
        progressBar.value = 0;
      }
      statusText.textContent = 'Pending...';
      processQueue();
    };

    if (item.id === currentModalItemId) modalStatusOverlay.classList.add('hidden');
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
      statusText.textContent = 'Removing background...';

      const options = getProcessingOptions();
      item.options = { ...options };
      const w = initWorker();
      w.postMessage({ id: item.id, file: item.file, modelUrl: MODEL_URL, options });
      updateUI();
    } catch (err) {
      console.error('Failed to start processing:', err);
      handleError(item, (err as Error).message);
      isProcessing = false;
      processQueue();
    }
  };

  const getOutputFilename = (originalName: string, format: 'png' | 'webp') => {
    return `${originalName.replace(/\.[^/.]+$/, '')}-no-bg.${format}`;
  };

  /** Flush the next pending reprocess (called after worker finishes a task) */
  const flushPendingReprocess = () => {
    if (isProcessing || pendingReprocess.size === 0) return;
    const [nextId, nextOpts] = pendingReprocess.entries().next().value!;
    pendingReprocess.delete(nextId);
    doReprocess(nextId, nextOpts);
  };

  /** Actually send the reprocess message to the worker */
  const doReprocess = (id: string, options: ProcessingOptions) => {
    const item = queue.find((it) => it.id === id);
    if (!item || !item.rawMask) return;

    isProcessing = true;
    item.status = 'processing';
    item.options = { ...options };

    const statusOverlay = item.element.querySelector('.status-overlay')!;
    statusOverlay.classList.remove('hidden');
    const statusText = item.element.querySelector('.status-text')!;
    statusText.textContent = 'Adjusting...';
    // Hide retry button from any previous error
    const retryBtn = statusOverlay.querySelector('.btn-retry') as HTMLElement | null;
    if (retryBtn) retryBtn.classList.add('hidden');
    const spinner = item.element.querySelector('.loading') as HTMLElement | null;
    if (spinner) spinner.classList.remove('hidden');

    if (id === currentModalItemId) {
      modalStatusOverlay.classList.remove('hidden');
    }

    const w = initWorker();
    w.postMessage({
      id: item.id,
      action: 'reprocess',
      file: item.file,
      rawMask: item.rawMask,
      options,
    });
  };

  /**
   * Get or create a debounced reprocess function for a specific item.
   * Each item gets its own debouncer so concurrent adjustments on different items don't interfere.
   */
  const getItemDebouncer = (id: string) => {
    let fn = reprocessDebouncers.get(id);
    if (!fn) {
      fn = debounce((options: ProcessingOptions) => {
        if (isProcessing) {
          // Queue it — will be picked up after the current task finishes
          pendingReprocess.set(id, options);
          const item = queue.find((it) => it.id === id);
          if (item) {
            const statusOverlay = item.element.querySelector('.status-overlay')!;
            statusOverlay.classList.remove('hidden');
            const statusText = item.element.querySelector('.status-text')!;
            statusText.textContent = 'Waiting...';
          }
        } else {
          doReprocess(id, options);
        }
      }, 150);
      reprocessDebouncers.set(id, fn);
    }
    return fn;
  };

  /**
   * Debounced reprocess: coalesces rapid slider changes (especially on mobile touch)
   * and serializes through the isProcessing flag to avoid overwhelming the worker.
   */
  const reprocessItem = (id: string, options: ProcessingOptions) => {
    const item = queue.find((it) => it.id === id);
    if (!item || !item.rawMask) return;
    getItemDebouncer(id)(options);
  };

  const addFilesToQueue = (files: FileList | File[]) => {
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const id = Math.random().toString(36).substring(2, 9);
        const originalUrl = URL.createObjectURL(file);

        const clone = template.content.cloneNode(true) as DocumentFragment;
        const container = clone.querySelector('.card') as HTMLElement;
        if (!container) continue;

        const filenameEl = container.querySelector('.filename');
        if (filenameEl) filenameEl.textContent = file.name;

        const formattedSize = `${(file.size / 1024).toFixed(1)} KB`;
        const filesizeEl = container.querySelector('.filesize');
        if (filesizeEl) filesizeEl.textContent = formattedSize;

        const originalPreview = container.querySelector('.original-preview') as HTMLImageElement;
        const resultPreview = container.querySelector('.result-preview') as HTMLImageElement;
        if (originalPreview) originalPreview.src = originalUrl;

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

        const btnRemove = container.querySelector('.btn-remove-item') as HTMLElement;
        btnRemove.onclick = () => {
          const index = queue.findIndex((item) => item.id === id);
          if (index !== -1) {
            const item = queue[index];
            if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
            URL.revokeObjectURL(item.originalUrl);
            queue.splice(index, 1);
          }
          // Free worker-side RGBA cache for this image
          worker?.postMessage({ id, action: 'evict' });
          const debounceFn = reprocessDebouncers.get(id);
          if (debounceFn) {
            debounceFn.cancel();
            reprocessDebouncers.delete(id);
          }
          pendingReprocess.delete(id);
          container.remove();
          updateUI();
        };

        const btnDownload = container.querySelector('.btn-download-item') as HTMLButtonElement;
        btnDownload.onclick = async () => {
          const item = queue.find((it) => it.id === id);
          if (item?.resultBlob) {
            const format = getSelectedFormat();
            const quality = getWebpQuality();
            const outputBlob = await convertBlobToFormat(item.resultBlob, format, quality);
            downloadFile(outputBlob, getOutputFilename(file.name, format));
          }
        };

        const btnCopy = container.querySelector('.btn-copy-item') as HTMLButtonElement;
        btnCopy.onclick = async () => {
          const item = queue.find((it) => it.id === id);
          if (item?.resultBlob) await copyBlobToClipboard(item.resultBlob);
        };

        const btnPreviewFull = container.querySelector('.btn-preview-full') as HTMLButtonElement;
        btnPreviewFull.onclick = () => {
          const item = queue.find((it) => it.id === id);
          if (item?.resultUrl) {
            currentModalItemId = item.id;
            modalImg.src = item.resultUrl;
            modalFilename.textContent = file.name;

            // Reset view mode to processed
            setModalViewMode('processed');

            // Populate modal sliders
            modalThresholdSlider.value = item.options.threshold.toString();
            modalThresholdVal.textContent = item.options.threshold.toString();
            modalSmoothSlider.value = item.options.smoothing.toString();
            modalSmoothVal.textContent = item.options.smoothing.toString();
            modalContrastSlider.value = item.options.contrast.toString();
            modalContrastVal.textContent = item.options.contrast.toFixed(1);
            modalRefineToggle.checked = item.options.useGuidedFilter;

            modalDownload.onclick = () => btnDownload.click();
            modalCopy.onclick = () => btnCopy.click();
            previewModal.showModal();
          }
        };

        const itemThreshold = container.querySelector('.item-threshold-slider') as HTMLInputElement;
        const itemSmooth = container.querySelector('.item-smooth-slider') as HTMLInputElement;
        const itemContrast = container.querySelector('.item-contrast-slider') as HTMLInputElement;
        const itemRefine = container.querySelector('.item-refine-toggle') as HTMLInputElement;
        const adjustOverlay = container.querySelector('.btn-settings-item') as HTMLElement;
        const btnToggleAdjust = container.querySelector('.btn-toggle-adjust') as HTMLElement;

        btnToggleAdjust.onclick = (e) => {
          e.stopPropagation();
          adjustOverlay.classList.toggle('force-show');
        };

        const onCardAdjust = () => {
          const options: ProcessingOptions = {
            threshold: parseInt(itemThreshold.value, 10),
            smoothing: parseInt(itemSmooth.value, 10),
            contrast: parseFloat(itemContrast.value),
            useGuidedFilter: itemRefine.checked,
          };
          reprocessItem(id, options);
        };

        itemThreshold.onchange = onCardAdjust;
        itemSmooth.onchange = onCardAdjust;
        itemContrast.onchange = onCardAdjust;
        itemRefine.onchange = onCardAdjust;

        [itemThreshold, itemSmooth, itemContrast].forEach((el) => {
          el.oninput = () => {
            const valLabel = el.parentElement?.querySelector('span[class*="-val"]');
            if (valLabel) valLabel.textContent = el.value;
          };
        });

        gallery.appendChild(container);
        queue.push({
          id,
          file,
          element: container,
          status: 'pending',
          originalUrl,
          formattedSize,
          options: { threshold: 128, smoothing: 4, contrast: 1.0, useGuidedFilter: false },
        });
      }
      updateUI();
      processQueue();
    } catch (err) {
      console.error('Error adding files to queue:', err);
      showMessage('Failed to add some files. Check console for details.', { type: 'alert' });
    }
  };

  // Modal Adjust Logic
  const onModalAdjust = () => {
    if (!currentModalItemId) return;
    const options: ProcessingOptions = {
      threshold: parseInt(modalThresholdSlider.value, 10),
      smoothing: parseInt(modalSmoothSlider.value, 10),
      contrast: parseFloat(modalContrastSlider.value),
      useGuidedFilter: modalRefineToggle.checked,
    };

    // Update labels
    modalThresholdVal.textContent = modalThresholdSlider.value;
    modalSmoothVal.textContent = modalSmoothSlider.value;
    modalContrastVal.textContent = parseFloat(modalContrastSlider.value).toFixed(1);

    // Sync back to card UI if visible
    const item = queue.find((it) => it.id === currentModalItemId);
    if (item) {
      const cardThreshold = item.element.querySelector(
        '.item-threshold-slider'
      ) as HTMLInputElement;
      const cardSmooth = item.element.querySelector('.item-smooth-slider') as HTMLInputElement;
      const cardContrast = item.element.querySelector('.item-contrast-slider') as HTMLInputElement;
      const cardRefine = item.element.querySelector('.item-refine-toggle') as HTMLInputElement;

      cardThreshold.value = modalThresholdSlider.value;
      cardSmooth.value = modalSmoothSlider.value;
      cardContrast.value = modalContrastSlider.value;
      cardRefine.checked = modalRefineToggle.checked;

      // Update card labels
      item.element.querySelector('.item-threshold-val')!.textContent = modalThresholdSlider.value;
      item.element.querySelector('.item-smooth-val')!.textContent = modalSmoothSlider.value;
      item.element.querySelector('.item-contrast-val')!.textContent = parseFloat(
        modalContrastSlider.value
      ).toFixed(1);
    }

    reprocessItem(currentModalItemId, options);

    // Switch to processed view since we're reprocessing
    if (modalViewMode !== 'processed') {
      setModalViewMode('processed');
    }
  };

  modalThresholdSlider.onchange = onModalAdjust;
  modalSmoothSlider.onchange = onModalAdjust;
  modalContrastSlider.onchange = onModalAdjust;
  modalRefineToggle.onchange = onModalAdjust;

  // View mode toggle handlers
  btnViewProcessed.onclick = () => setModalViewMode('processed');
  btnViewOriginal.onclick = () => setModalViewMode('original');
  btnViewOutline.onclick = () => setModalViewMode('outline');

  // Reposition outline canvas when image dimensions change
  modalImg.addEventListener('load', () => {
    if (modalViewMode === 'outline' && !modalOutlineCanvas.classList.contains('hidden')) {
      positionOutlineCanvas();
    }
  });
  const onModalResize = debounce(() => {
    if (modalViewMode === 'outline' && !modalOutlineCanvas.classList.contains('hidden')) {
      positionOutlineCanvas();
    }
  }, 100);
  window.addEventListener('resize', onModalResize);

  // Real-time label updates for modal
  [modalThresholdSlider, modalSmoothSlider, modalContrastSlider].forEach((el) => {
    el.oninput = () => {
      const valLabel = el.parentElement?.querySelector('span[class*="-val"]');
      if (valLabel)
        valLabel.textContent =
          el.value === modalContrastSlider.value ? parseFloat(el.value).toFixed(1) : el.value;
    };
  });

  setupFileDropzone('dropzone', 'image-input', addFilesToQueue);

  pasteBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imageBlob = await retrieveImageBlobFromClipboard();
    if (imageBlob) {
      addFilesToQueue([new File([imageBlob], `pasted-image-${Date.now()}.png`, { type: imageBlob.type })]);
    } else {
      showMessage('No image found in clipboard.', { type: 'info', timeoutMs: 5000 });
    }
  });

  btnClear.addEventListener('click', () => {
    queue.forEach((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      URL.revokeObjectURL(item.originalUrl);
      worker?.postMessage({ id: item.id, action: 'evict' });
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
      const zipFiles: DownloadBuffer[] = await Promise.all(
        doneItems.map(async (item) => {
          const outputBlob = await convertBlobToFormat(item.resultBlob!, format, quality);
          return {
            data: await outputBlob.arrayBuffer(),
            name: getOutputFilename(item.file.name, format),
          };
        })
      );
      await downloadAsZip(zipFiles, `background-removed-images.zip`);
    } catch (e) {
      showMessage('Failed to create ZIP file.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  if (payload?.sharedFiles?.length) addFilesToQueue(payload.sharedFiles);
  return () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    reprocessDebouncers.forEach((fn) => fn.cancel());
    reprocessDebouncers.clear();
    pendingReprocess.clear();
    onModalResize.cancel();
    window.removeEventListener('resize', onModalResize);
    queue.forEach((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      URL.revokeObjectURL(item.originalUrl);
    });
  };
}
