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
      const capabilities = track.getCapabilities() as any;
      if (capabilities.focusMode?.includes('continuous')) {
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
