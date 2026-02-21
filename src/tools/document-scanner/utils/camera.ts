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
    // We use ideal constraints to hint the browser about the desired orientation.
    // Most modern mobile browsers will rotate the video track to match these.
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode,
        width: { ideal: isPortrait ? 2160 : 3840 },
        height: { ideal: isPortrait ? 3840 : 2160 },
        aspectRatio: { ideal: isPortrait ? 9/16 : 16/9 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    videoEl.srcObject = stream;
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
