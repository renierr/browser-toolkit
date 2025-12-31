import jsQR from 'jsqr';
import { showMessage } from '../../js/ui.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const video = document.getElementById('qr-video') as HTMLVideoElement;
  const canvasElement = document.getElementById('qr-canvas') as HTMLCanvasElement;
  const canvas = canvasElement.getContext('2d', { willReadFrequently: true });
  const videoContainer = document.getElementById('video-container');
  const startBtn = document.getElementById('start-camera');
  const stopBtn = document.getElementById('stop-camera');
  const fileInput = document.getElementById('qr-input') as HTMLInputElement;
  const resultCard = document.getElementById('result-card');
  const resultText = document.getElementById('qr-result');
  const copyBtn = document.getElementById('copy-result');
  const openLinkBtn = document.getElementById('open-link') as HTMLAnchorElement;

  let stream: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let lastScanTime = 0;
  const SCAN_INTERVAL = 200; // Scan every 200ms

  // Initialize detector once
  let detector: any = null;
  if ('BarcodeDetector' in window) {
    try {
      // @ts-ignore
      detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) {
      console.warn('BarcodeDetector initialization failed', e);
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    videoContainer?.classList.add('hidden');
    stopBtn?.classList.add('hidden');
    startBtn?.classList.remove('hidden');
  };

  const setResult = (data: string) => {
    if (resultText) resultText.textContent = data;
    resultCard?.classList.remove('hidden');

    if (data.startsWith('http://') || data.startsWith('https://')) {
      openLinkBtn.href = data;
      openLinkBtn.classList.remove('hidden');
    } else {
      openLinkBtn.classList.add('hidden');
    }
  };

  const tick = async (time: number) => {
    if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      // Throttle scanning
      if (time - lastScanTime >= SCAN_INTERVAL) {
        lastScanTime = time;
        let qrData: string | null = null;

        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              qrData = barcodes[0].rawValue;
            }
          } catch (e) {
            console.warn('BarcodeDetector failed, falling back to jsQR', e);
          }
        }

        if (!qrData) {
          // Downscale for jsQR to save resources (max 640px)
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvasElement.width = video.videoWidth * scale;
          canvasElement.height = video.videoHeight * scale;

          canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
          const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code) {
            qrData = code.data;
          }
        }

        if (qrData) {
          setResult(qrData);
          stopCamera();
          return;
        }
      }
    }
    animationFrameId = requestAnimationFrame(tick);
  };

  startBtn?.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.play();
      videoContainer?.classList.remove('hidden');
      startBtn.classList.add('hidden');
      stopBtn?.classList.remove('hidden');
      animationFrameId = requestAnimationFrame(tick);
    } catch (err) {
      console.error('Error accessing camera:', err);
      showMessage('Could not access camera. Please ensure you have given permission.', { type: 'alert' });
    }
  });

  stopBtn?.addEventListener('click', stopCamera);

  fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        let qrData: string | null = null;

        if (detector) {
          try {
            const barcodes = await detector.detect(img);
            if (barcodes.length > 0) {
              qrData = barcodes[0].rawValue;
            }
          } catch (e) {
            console.warn('BarcodeDetector failed, falling back to jsQR', e);
          }
        }

        if (!qrData && canvas) {
          const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
          canvasElement.width = img.width * scale;
          canvasElement.height = img.height * scale;
          canvas.drawImage(img, 0, 0, canvasElement.width, canvasElement.height);
          const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            qrData = code.data;
          }
        }

        if (qrData) {
          setResult(qrData);
        } else {
          showMessage('No QR code found in image.', { type: 'alert' });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

  copyBtn?.addEventListener('click', () => {
    if (resultText?.textContent) {
      navigator.clipboard.writeText(resultText.textContent);
    }
  });

  return () => {
    stopCamera();
  };
}
