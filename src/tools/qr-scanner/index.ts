import jsQR from 'jsqr';

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
      stream.getTracks().forEach(track => track.stop());
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

  const tick = () => {
    if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      canvasElement.height = video.videoHeight;
      canvasElement.width = video.videoWidth;
      canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
      const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        setResult(code.data);
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
      alert('Could not access camera. Please ensure you have given permission.');
    }
  });

  stopBtn?.addEventListener('click', stopCamera);

  fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (canvas) {
          canvasElement.width = img.width;
          canvasElement.height = img.height;
          canvas.drawImage(img, 0, 0);
          const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            setResult(code.data);
          } else {
            alert('No QR code found in image.');
          }
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
