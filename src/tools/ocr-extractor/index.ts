import { retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils';
import { showMessage, showProgress, hideProgress, yieldToUI } from '../../js/ui';
import Tesseract from 'tesseract.js';
import tesseractWorker from 'tesseract.js/dist/worker.min.js?url';
import tesseractWasm from 'tesseract.js-core/tesseract-core-simd.wasm.js?url'

const TESSERACT_LANGS = ['deu', 'eng', 'deu_frak'];

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const statusContainer = document.getElementById('status-container');
  const statusText = document.getElementById('status-text');
  const progressPercent = document.getElementById('progress-percent');
  const ocrProgress = document.getElementById('ocr-progress') as HTMLProgressElement;
  const resultContainer = document.getElementById('result-container');
  const previewImg = document.getElementById('preview-img') as HTMLImageElement;
  const outputText = document.getElementById('output-text') as HTMLTextAreaElement;
  const copyBtn = document.getElementById('copy-btn');
  const pasteBtn = document.getElementById('paste-btn');

  let worker: Tesseract.Worker | null = null;

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
    ocrProgress.value = 0;
    if (progressPercent) progressPercent.textContent = '0%';
    if (statusText) statusText.textContent = 'Initializing Tesseract...';

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg && e.target?.result) {
        previewImg.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);

    try {
      showProgress('Recognizing text...');
      await yieldToUI(true);

      if (!worker) {
        worker = await Tesseract.createWorker(TESSERACT_LANGS, 1, {
          workerPath: tesseractWorker,
          corePath: tesseractWasm,
          langPath: './lib/tesseract/lang-data',
          logger: async (m) => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              ocrProgress.value = progress;
              if (progressPercent) progressPercent.textContent = `${progress}%`;
              if (statusText) statusText.textContent = 'Recognizing text...';
              showProgress(`Recognizing text... ${progress}%`);
              await yieldToUI(true);
            } else if (statusText) {
              statusText.textContent = m.status;
            }
          },
        });
      }

      const {
        data: { text },
      } = await worker.recognize(file);

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

  setupFileDropzone('dropzone', 'image-input', (files) => {
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
