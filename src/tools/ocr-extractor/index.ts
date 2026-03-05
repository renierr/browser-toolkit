import { retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils';
import { showMessage, showProgress, hideProgress } from '../../js/ui';
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
      worker.postMessage({
        type: 'init',
        detModelUrl: DET_MODEL_URL,
        recModelUrl: REC_MODEL_URL
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
    statusContainer?.classList.remove('hidden');
    outputText.value = '';
    if (statusText) statusText.textContent = 'Initializing OCR models...';

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg && e.target?.result) {
        previewImg.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);

    try {
      showProgress('Loading models...');
      const ocrWorker = await getWorker();

      // Convert Blob to ImageData
      const img = new Image();
      const imgLoadPromise = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image for OCR'));
      });
      img.src = URL.createObjectURL(file);
      await imgLoadPromise;

      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(img.src);

      // 1. Detect
      if (statusText) statusText.textContent = 'Detecting text...';
      showProgress('Detecting text...');
      ocrWorker.postMessage({ type: 'detect', imageData }, [imageData.data.buffer]);

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

      // Need a fresh copy of ImageData buffer if we transferred it
      // Actually, we need to pass a slice or just not transfer it if we need it again.
      // But we can recreate it or just not transfer it for detection.
      // Let's recreate it for now to be safe, or just avoid transfer for detection.
      ctx.drawImage(img, 0, 0);
      const imageDataForRec = ctx.getImageData(0, 0, img.width, img.height);

      ocrWorker.postMessage({ type: 'recognize', imageData: imageDataForRec, boxes }, [imageDataForRec.data.buffer]);

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
