export async function startCamera(
  videoEl: HTMLVideoElement,
  facingMode: 'user' | 'environment',
  prevStream: MediaStream | null
): Promise<MediaStream | null> {
  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 2160 },
        height: { ideal: 3840 },
        aspectRatio: { ideal: 0.707 } // A4 Aspect Ratio
      },
      audio: false,
    });
    videoEl.srcObject = stream;
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
