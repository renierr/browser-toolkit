import { showMessage } from '../../js/ui.ts';
import { retrieveImageBlobFromClipboard } from '../../js/file-utils.ts';
import {
  startCamera,
  stopCamera,
  switchToNextCamera,
  isTorchSupported,
  toggleTorch,
  resetCameraState,
  getVideoDeviceCount,
} from '../../js/camera-utils';
import ScanWorker from './scan.worker?worker';
import type { WorkerOutMessage, ScanImageMessage } from './worker-protocol';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const video = document.getElementById('qr-video') as HTMLVideoElement;
  const canvasElement = document.getElementById('qr-canvas') as HTMLCanvasElement;
  const canvas = canvasElement.getContext('2d', { willReadFrequently: true });
  const videoContainer = document.getElementById('video-container');
  const startBtn = document.getElementById('start-camera');
  const stopBtn = document.getElementById('stop-camera');
  const toggleFlashBtn = document.getElementById('toggle-flash');
  const switchCameraBtn = document.getElementById('switch-camera');
  const fileInput = document.getElementById('qr-input') as HTMLInputElement;
  const pasteBtn = document.getElementById('paste-btn');
  const pasteTarget = document.getElementById('paste-target');
  const resultCard = document.getElementById('result-card');
  const resultText = document.getElementById('qr-result');
  const formatText = document.getElementById('qr-format');
  const copyBtn = document.getElementById('copy-result');
  const openLinkBtn = document.getElementById('open-link') as HTMLAnchorElement;
  const capturedImage = document.getElementById('qr-captured-image') as HTMLImageElement;

  let stream: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let lastScanTime = 0;
  const SCAN_INTERVAL = 150;
  let isFlashOn = false;

  // ── Web Worker for CPU-heavy WASM + image preprocessing ──────────────

  let worker: Worker | null = null;
  let workerRequestId = 0;
  let workerScanInFlight = false;

  const pendingRequests = new Map<
    number,
    {
      resolve: (data: { data: string; format: string; provider?: string } | null) => void;
      reject: (err: Error) => void;
    }
  >();

  function getWorker(): Worker {
    if (!worker) {
      worker = new ScanWorker();
      worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
        const { id, data, format, provider } = event.data;
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          pending.resolve(data ? { data, format, provider } : null);
        }
      });
      worker.addEventListener('error', () => {
        for (const [, req] of pendingRequests) {
          req.reject(new Error('QR scan worker error'));
        }
        pendingRequests.clear();
        workerScanInFlight = false;
      });
    }
    return worker;
  }

  function sendToWorker(
    msg: ScanImageMessage,
    transfer: Transferable[] = []
  ): Promise<{
    data: string;
    format: string;
    provider?: string;
  } | null> {
    return new Promise((resolve, reject) => {
      pendingRequests.set(msg.id, { resolve, reject });
      try {
        getWorker().postMessage(msg, transfer);
      } catch (e) {
        pendingRequests.delete(msg.id);
        reject(e);
      }
    });
  }

  function terminateWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    for (const [, req] of pendingRequests) {
      req.reject(new Error('Worker terminated'));
    }
    pendingRequests.clear();
    workerScanInFlight = false;
  }

  // ── BarcodeDetector (native, if available) ───────────────────────────

  let detector: any = null;

  const initDetector = async () => {
    if (!window.isSecureContext) return;
    if ('BarcodeDetector' in window) {
      try {
        // @ts-ignore
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported && supported.length > 0) {
          // @ts-ignore
          detector = new BarcodeDetector({ formats: supported });
        }
      } catch (e) {
        console.error('BarcodeDetector initialization failed:', e);
      }
    }
  };

  // noinspection JSIgnoredPromiseFromCall
  initDetector();

  // ── Camera controls ──────────────────────────────────────────────────

  const stopCam = () => {
    if (stream && isFlashOn) {
      // noinspection JSIgnoredPromiseFromCall
      toggleTorch(stream, false);
    }
    stream = stopCamera(stream);
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isFlashOn = false;
    workerScanInFlight = false;
    toggleFlashBtn?.classList.add('hidden');
    toggleFlashBtn?.classList.remove('btn-active', 'text-accent');
    switchCameraBtn?.classList.add('hidden');
    videoContainer?.classList.add('hidden');
    stopBtn?.classList.add('hidden');
    startBtn?.classList.remove('hidden');
  };

  async function checkAndShowControls() {
    // Show switch button if more than 1 camera
    if (getVideoDeviceCount() > 1) {
      switchCameraBtn?.classList.remove('hidden');
    } else {
      switchCameraBtn?.classList.add('hidden');
    }

    // Check torch support (fire-and-forget with retries)
    const torchOk = await isTorchSupported(stream);
    if (torchOk) {
      toggleFlashBtn?.classList.remove('hidden');
    } else {
      toggleFlashBtn?.classList.add('hidden');
    }
  }

  // ── Result display ───────────────────────────────────────────────────

  const setResult = (
    data: string,
    format: string = 'qr_code',
    provider: string = 'unknown',
    imageSrc?: string
  ) => {
    if (resultText) resultText.textContent = data;
    if (formatText) {
      formatText.textContent = `${format.toUpperCase().replace('_', ' ')} (${provider})`;
    }
    if (capturedImage && imageSrc) capturedImage.src = imageSrc;
    resultCard?.classList.remove('hidden');

    if (data.startsWith('http://') || data.startsWith('https://')) {
      openLinkBtn.href = data;
      openLinkBtn.classList.remove('hidden');
    } else {
      openLinkBtn.classList.add('hidden');
    }
  };

  // ── Image scanning (upload / paste) ──────────────────────────────────

  const scanImage = (img: HTMLImageElement) => {
    img.onload = async () => {
      let result: {
        data: string;
        format: string;
        provider: string;
      } | null = null;

      // Try native BarcodeDetector first
      if (detector) {
        try {
          const barcodes = await detector.detect(img);
          if (barcodes.length > 0) {
            result = { data: barcodes[0].rawValue, format: barcodes[0].format, provider: 'native' };
          }
        } catch (e) {
          console.warn('BarcodeDetector failed', e);
        }
      }

      // Fallback: WASM Polyfill via Web Worker
      if (!result && canvas) {
        const maxDim = Math.min(Math.max(img.width, img.height), 2048);
        const w = Math.round(img.width * Math.min(1, maxDim / Math.max(img.width, img.height)));
        const h = Math.round(img.height * Math.min(1, maxDim / Math.max(img.width, img.height)));

        const id = ++workerRequestId;
        try {
          const bitmap = await createImageBitmap(img, {
            resizeWidth: w,
            resizeHeight: h,
            resizeQuality: 'high',
          });
          const res = await sendToWorker(
            {
              type: 'scan-image',
              id,
              bitmap,
            },
            [bitmap]
          );
          if (res) {
            result = { ...res, provider: res.provider || 'wasm' };
          }
        } catch (e) {
          console.warn('Worker scan-image failed', e);
        }
      }

      if (result) {
        // Draw final capture image at a reasonable display size
        const displayScale = Math.min(1, 1024 / Math.max(img.width, img.height));
        canvasElement.width = Math.round(img.width * displayScale);
        canvasElement.height = Math.round(img.height * displayScale);
        canvas!.imageSmoothingEnabled = true;
        canvas!.drawImage(img, 0, 0, canvasElement.width, canvasElement.height);
        setResult(
          result.data,
          result.format,
          result.provider,
          canvasElement.toDataURL('image/png')
        );
      } else {
        showMessage('No barcode found.', { type: 'alert' });
      }
    };
  };

  // ── Clipboard helpers ────────────────────────────────────────────────

  const processClipboardItems = (items: DataTransferItemList) => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          scanImage(img);
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(blob);
        return true;
      }
    }
    return false;
  };

  // ── Camera scan loop ─────────────────────────────────────────────────

  const drawVideoToCanvas = () => {
    const maxDim = 1080;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    canvasElement.width = w;
    canvasElement.height = h;
    if (canvas) {
      canvas.imageSmoothingEnabled = false; // preserve sharp QR edges
      canvas.drawImage(video, 0, 0, w, h);
    }
  };

  const tick = async (time: number) => {
    if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      if (time - lastScanTime >= SCAN_INTERVAL) {
        lastScanTime = time;
        let result: {
          data: string;
          format: string;
          provider: string;
        } | null = null;

        // Try native BarcodeDetector first
        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              result = {
                data: barcodes[0].rawValue,
                format: barcodes[0].format,
                provider: 'native',
              };
            }
          } catch (e) {
            console.warn('BarcodeDetector detection failed', e);
          }
        }

        if (result) {
          drawVideoToCanvas();
          setResult(
            result.data,
            result.format,
            result.provider,
            canvasElement.toDataURL('image/png')
          );
          stopCam();
          return;
        }

        // Fallback to WASM Polyfill via Web Worker (skip if previous scan still in flight)
        if (!result && !workerScanInFlight) {
          const bitmap = await createImageBitmap(video);
          const id = ++workerRequestId;

          workerScanInFlight = true;
          sendToWorker(
            {
              type: 'scan-image',
              id,
              bitmap: bitmap,
            },
            [bitmap]
          )
            .then((res) => {
              workerScanInFlight = false;
              if (res && stream) {
                if (res.data) {
                  // Re-draw the current video frame for the captured image
                  drawVideoToCanvas();
                  setResult(
                    res.data,
                    res.format,
                    res.provider || 'wasm',
                    canvasElement.toDataURL('image/png')
                  );
                  stopCam();
                }
              }
            })
            .catch(() => {
              workerScanInFlight = false;
            });
        }
      }
    }
    animationFrameId = requestAnimationFrame(tick);
  };

  // ── Event listeners ──────────────────────────────────────────────────

  startBtn?.addEventListener('click', async () => {
    try {
      stream = await startCamera({
        videoEl: video,
        width: 1920,
        height: 1080,
      });

      if (!stream) {
        showMessage('Could not access camera.', { type: 'alert' });
        return;
      }

      videoContainer?.classList.remove('hidden');
      startBtn.classList.add('hidden');
      stopBtn?.classList.remove('hidden');
      animationFrameId = requestAnimationFrame(tick);

      // Fire-and-forget: check torch & device count once camera is up
      // noinspection ES6MissingAwait
      checkAndShowControls();
    } catch (err) {
      console.error('Error accessing camera:', err);
      showMessage('Could not access camera.', { type: 'alert' });
    }
  });

  stopBtn?.addEventListener('click', stopCam);

  switchCameraBtn?.addEventListener('click', async () => {
    switchCameraBtn.classList.add('btn-disabled');
    const newStream = await switchToNextCamera(video, stream);
    if (newStream && newStream !== stream) {
      stream = newStream;
      isFlashOn = false;
      toggleFlashBtn?.classList.remove('btn-active', 'text-accent');
      // Re-check torch for the new lens
      // noinspection ES6MissingAwait
      checkAndShowControls();
      showMessage('Camera switched', { type: 'info', timeoutMs: 1500 });
    } else if (newStream === stream) {
      showMessage('No other camera available', { type: 'info', timeoutMs: 2000 });
    }
    switchCameraBtn.classList.remove('btn-disabled');
  });

  toggleFlashBtn?.addEventListener('click', async () => {
    isFlashOn = !isFlashOn;
    await toggleTorch(stream, isFlashOn);
    toggleFlashBtn.classList.toggle('btn-active', isFlashOn);
    toggleFlashBtn.classList.toggle('text-accent', isFlashOn);
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    await file.slice(0, 1).arrayBuffer();
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => URL.revokeObjectURL(url);
    scanImage(img);
    img.src = url;
  });

  pasteBtn?.addEventListener('click', async () => {
    try {
      const imageBlob = await retrieveImageBlobFromClipboard();
      if (imageBlob) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          scanImage(img);
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(imageBlob);
        return;
      } else if (navigator.clipboard) {
        showMessage('No image found in clipboard.', { type: 'info' });
      } else {
        // Fallback: show paste target for mobile/older browsers
        pasteTarget?.classList.toggle('hidden');
        if (!pasteTarget?.classList.contains('hidden')) {
          (pasteTarget as HTMLElement).focus();
        }
      }
    } catch (err) {
      console.warn('Clipboard API failed, showing paste target', err);
      pasteTarget?.classList.toggle('hidden');
      if (!pasteTarget?.classList.contains('hidden')) {
        (pasteTarget as HTMLElement).focus();
      }
    }
  });

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items && processClipboardItems(items)) {
      pasteTarget?.classList.add('hidden');
      if (pasteTarget) pasteTarget.textContent = 'Tap here and paste image';
    }
  };

  window.addEventListener('paste', handlePaste);
  pasteTarget?.addEventListener('paste', handlePaste);

  copyBtn?.addEventListener('click', () => {
    if (resultText?.textContent) {
      // noinspection JSIgnoredPromiseFromCall
      navigator.clipboard.writeText(resultText.textContent);
    }
  });

  return () => {
    stopCam();
    terminateWorker();
    resetCameraState();
    window.removeEventListener('paste', handlePaste);
  };
}
