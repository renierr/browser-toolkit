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
    // Requesting specific dimensions and aspect ratio hints the browser
    // to provide the stream in the desired orientation.
    const width = isPortrait ? { ideal: 2160, min: 720 } : { ideal: 3840, min: 1280 };
    const height = isPortrait ? { ideal: 3840, min: 1280 } : { ideal: 2160, min: 720 };
    const aspectRatio = isPortrait ? { ideal: 9/16 } : { ideal: 16/9 };

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width,
        height,
        aspectRatio,
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false,
    });

    videoEl.srcObject = stream;
    // Explicitly play to ensure the smoothest start
    videoEl.play().catch(e => console.warn("Auto-play prevented:", e));

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
