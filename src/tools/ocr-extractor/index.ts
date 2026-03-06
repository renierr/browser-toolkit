import { retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils';
import { showMessage, showProgress, hideProgress } from '../../js/ui';
import { blobToImageData } from '../../js/image-utils';
import OcrWorker from './worker?worker';

const DET_MODEL_URL = new URL('./lib/models/ocr/det.onnx', document.baseURI).href;
const REC_MODEL_URL = new URL('./lib/models/ocr/rec.onnx', document.baseURI).href;

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const statusContainer = document.getElementById('status-container');
  const statusText = document.getElementById('status-text');
  const resultContainer = document.getElementById('result-container');
  const previewImg = document.getElementById('preview-img') as HTMLImageElement;
  const outputText = document.getElementById('output-text') as HTMLTextAreaElement;
  const copyBtn = document.getElementById('copy-btn');
  const pasteBtn = document.getElementById('paste-btn');

  let worker: Worker | null = null;
  let initPromise: Promise<void> | null = null;

  const getWorker = (): Promise<Worker> => {
    if (worker) return Promise.resolve(worker);
    if (initPromise) return initPromise.then(() => worker!);

    initPromise = new Promise((resolve, reject) => {
      worker = new OcrWorker();
      worker.onmessage = (e) => {
        const { type, error } = e.data;
        if (type === 'init-done') {
          resolve();
        } else if (type === 'error') {
          reject(new Error(error));
        }
      };
      const config = {
        targetSize: Number((document.getElementById('targetSize') as HTMLInputElement).value) || undefined,
        detThreshold: Number((document.getElementById('detThreshold') as HTMLInputElement).value) || undefined,
        boxScoreThreshold: Number((document.getElementById('boxScoreThreshold') as HTMLInputElement).value) || undefined,
        maxBoxes: Number((document.getElementById('maxBoxes') as HTMLInputElement).value) || undefined,
        forceWasm: (document.getElementById('forceWasm') as HTMLInputElement).checked,
      };
      worker.postMessage({
        type: 'init',
        detModelUrl: DET_MODEL_URL,
        recModelUrl: REC_MODEL_URL,
        config,
      });
    });
    return initPromise.then(() => worker!);
  };

  const cleanup = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const processImage = async (file: Blob) => {
    if (!file.type.startsWith('image/')) {
      showMessage('Please upload an image file.', { type: 'alert' });
      return;
    }

    // Reset UI
    resultContainer?.classList.add('hidden');
    statusContainer?.classList.remove('hidden');
    outputText.value = '';
    if (statusText) statusText.textContent = 'Initializing OCR models...';

    try {
      // Show preview
      showProgress('Decoding image...');
      const previewUrl = URL.createObjectURL(file);
      if (previewImg) previewImg.src = previewUrl;

      // Build a preview element for the progress overlay
      const progressPreviewImg = document.createElement('img');
      progressPreviewImg.src = previewUrl;
      progressPreviewImg.alt = 'Uploaded image preview';

      // Wrap in a container with a scan-line animation
      const previewWrapper = document.createElement('div');
      previewWrapper.style.position = 'relative';
      previewWrapper.style.display = 'inline-block';
      previewWrapper.style.overflow = 'hidden';
      previewWrapper.style.borderRadius = '0.5rem';

      const scanLine = document.createElement('div');
      scanLine.className = 'scan-line';
      previewWrapper.appendChild(scanLine);
      previewWrapper.appendChild(progressPreviewImg);

      // Convert Blob to ImageData (worker-safe path via OffscreenCanvas)
      const imageData = await blobToImageData(file);

      showProgress('Loading models...', { contentElement: previewWrapper });
      const ocrWorker = await getWorker();

      // 1. Detect
      if (statusText) statusText.textContent = 'Detecting text...';
      showProgress('Detecting text...');
      ocrWorker.postMessage({ type: 'detect', imageData });

      const boxes: number[][][] = await new Promise((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'detect-done') {
            ocrWorker.removeEventListener('message', handler);
            resolve(e.data.boxes);
          } else if (e.data.type === 'progress') {
            const progress = Math.round(e.data.progress);
            showProgress('Detecting text...', { progress });
          } else if (e.data.type === 'error') {
            ocrWorker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };
        ocrWorker.addEventListener('message', handler);
      });

      if (boxes.length === 0) {
        showMessage('No text detected in the image.', { type: 'info' });
        statusContainer?.classList.add('hidden');
        return;
      }

      // 2. Recognize
      if (statusText) statusText.textContent = `Recognizing text (0/${boxes.length})...`;
      showProgress(`Recognizing text...`);

      ocrWorker.postMessage({ type: 'recognize', imageData, boxes });

      const text: string = await new Promise((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'recognize-done') {
            ocrWorker.removeEventListener('message', handler);
            resolve(e.data.text);
          } else if (e.data.type === 'progress') {
            const progress = Math.round(e.data.progress);
            showProgress('Recognizing text...', { progress });
          } else if (e.data.type === 'error') {
            ocrWorker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };
        ocrWorker.addEventListener('message', handler);
      });

      outputText.value = text;
      resultContainer?.classList.remove('hidden');
      statusContainer?.classList.add('hidden');

      if (!text.trim()) {
        showMessage('No text detected in the image.', { type: 'info' });
      }
    } catch (error) {
      console.error('OCR Error:', error);
      showMessage('Failed to process image.', { type: 'alert' });
      statusContainer?.classList.add('hidden');
    } finally {
      hideProgress();
    }
  };

  setupFileDropzone('dropzone', 'image-input', (files: FileList | File[]) => {
    if (files.length > 0) {
      processImage(files[0]);
    }
  });

  pasteBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imageBlob = await retrieveImageBlobFromClipboard();
    if (imageBlob) {
      processImage(imageBlob);
    } else {
      showMessage('No image found in clipboard.', { type: 'info', timeoutMs: 5000 });
    }
  });

  copyBtn?.addEventListener('click', () => {
    if (!outputText.value) return;
    navigator.clipboard.writeText(outputText.value);
    showMessage('Text copied to clipboard!', { type: 'info' });
  });

  return cleanup;
}
