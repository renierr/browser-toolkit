export async function startCamera(
  videoEl: HTMLVideoElement,
  facingMode: 'user' | 'environment',
  prevStream: MediaStream | null,
  isPortrait: boolean = true
): Promise<MediaStream | null> {
  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }
  try {
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode,
        width: { ideal: isPortrait ? 1080 : 1920 },
        height: { ideal: isPortrait ? 1920 : 1080 },
        aspectRatio: { ideal: isPortrait ? 9 / 16 : 16 / 9 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Attempt to enable continuous auto-focus if supported by the hardware
    const track = stream.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.focusMode?.includes('continuous')) {
        try {
          await track.applyConstraints({ focusMode: 'continuous' } as any);
        } catch (e) {
          console.debug('Focus mode not supported or failed to apply', e);
        }
      }
    }

    videoEl.srcObject = stream;
    videoEl.play().catch((e) => console.warn('Auto-play prevented:', e));

    document.getElementById('camera-error')?.classList.add('hidden');
    return stream;
  } catch (err) {
    console.error('Camera error:', err);
    document.getElementById('camera-error')?.classList.remove('hidden');
    return null;
  }
}

export function stopCamera(prevStream: MediaStream | null): null {
  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }
  return null;
}

export async function isTorchSupported(stream: MediaStream | null): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track) return false;

  // Check if the browser even supports the torch constraint
  const supportedConstraints = navigator.mediaDevices.getSupportedConstraints() as any;
  if (!supportedConstraints.torch) return false;

  // Retry a few times as capabilities might not be immediately available on some Android devices
  for (let i = 0; i < 3; i++) {
    try {
      if (typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities() as any;
        if (capabilities && capabilities.torch) return true;
      }

      const settings = track.getSettings() as any;
      if (settings && 'torch' in settings) return true;
    } catch (e) {
      console.debug('Error checking torch support:', e);
    }

    if (i < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return false;
}

export async function toggleTorch(stream: MediaStream | null, enable: boolean): Promise<void> {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  try {
    await track.applyConstraints({
      advanced: [{ torch: enable }],
    } as any);
  } catch (e) {
    console.warn('Failed to toggle torch with advanced constraints, trying direct fallback', e);
    try {
      // Fallback for some non-standard implementations or specific browser versions
      await track.applyConstraints({ torch: enable } as any);
    } catch (e2) {
      console.error('Failed to toggle torch:', e2);
    }
  }
}

export async function capturePhoto(
  video: HTMLVideoElement,
  stream: MediaStream | null
): Promise<Blob | null> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return null;

  let blob: Blob | null = null;

  // 1. Try ImageCapture (Photo Mode) - Best resolution, Chrome/Android only
  if ('ImageCapture' in window) {
    try {
      const imageCapture = new (window as any).ImageCapture(track);
      blob = await imageCapture.takePhoto();
    } catch (e) {
      console.warn('ImageCapture failed, falling back to video frame', e);
    }
  }

  // 2. Fallback to Video Frame - Essential for iOS/Safari
  if (!blob) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  }

  return blob;
}
