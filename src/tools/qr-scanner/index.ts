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

  const tick = async () => {
    if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      let qrData: string | null = null;

      // Try native BarcodeDetector API first
      if ('BarcodeDetector' in window) {
        try {
          // @ts-ignore
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          // @ts-ignore
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            qrData = barcodes[0].rawValue;
          }
        } catch (e) {
          console.warn('BarcodeDetector failed, falling back to jsQR', e);
        }
      }

      // Fallback to jsQR
      if (!qrData) {
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;
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

        if ('BarcodeDetector' in window) {
          try {
            // @ts-ignore
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            // @ts-ignore
            const barcodes = await detector.detect(img);
            if (barcodes.length > 0) {
              qrData = barcodes[0].rawValue;
            }
          } catch (e) {
            console.warn('BarcodeDetector failed, falling back to jsQR', e);
          }
        }

        if (!qrData && canvas) {
          canvasElement.width = img.width;
          canvasElement.height = img.height;
          canvas.drawImage(img, 0, 0);
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
