// --- Device Enumeration ---

let videoDevices: MediaDeviceInfo[] = [];
let currentDeviceIndex = -1;

/** Reset module-level state. Call on tool cleanup / destroy. */
export function resetCameraState() {
  videoDevices = [];
  currentDeviceIndex = -1;
}

/**
 * Enumerate all video input devices. Must be called after at least one
 * getUserMedia call (otherwise labels are empty on many browsers).
 */
async function enumerateVideoDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === 'videoinput');
  } catch (e) {
    console.warn('Failed to enumerate devices:', e);
    videoDevices = [];
  }
  return videoDevices;
}

/**
 * Get the next device index for cycling through cameras.
 * Returns the index into the videoDevices array.
 */
function getNextDeviceIndex(): number {
  if (videoDevices.length === 0) return -1;
  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  return currentDeviceIndex;
}

/**
 * Set the current device index (e.g. when starting with a specific facing mode).
 */
function updateCurrentDeviceIndex(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const settings = track.getSettings();
  const deviceId = settings.deviceId;
  if (deviceId) {
    const idx = videoDevices.findIndex((d) => d.deviceId === deviceId);
    if (idx >= 0) currentDeviceIndex = idx;
  }
}

// --- Camera Start/Stop ---

export async function startCamera(
  videoEl: HTMLVideoElement,
  facingMode: 'user' | 'environment',
  prevStream: MediaStream | null,
  deviceId?: string
): Promise<MediaStream | null> {
  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }
  try {
    // Build constraints: prefer deviceId if provided, otherwise use facingMode.
    // Request high resolution without orientation bias — the device/browser
    // handles sensor orientation naturally, and object-contain fits the preview.
    const videoConstraints: MediaTrackConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
        }
      : {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
        };

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });

    // Enable continuous autofocus if supported
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

    // Enumerate devices after first getUserMedia (needed for labels)
    // and track which device we're currently using
    await enumerateVideoDevices();
    updateCurrentDeviceIndex(stream);

    return stream;
  } catch (err) {
    console.error('Camera error:', err);
    document.getElementById('camera-error')?.classList.remove('hidden');
    return null;
  }
}

/**
 * Switch to the next available camera lens/device.
 * Returns the new stream, or null if switching failed.
 */
export async function switchToNextCamera(
  videoEl: HTMLVideoElement,
  prevStream: MediaStream | null
): Promise<MediaStream | null> {
  if (videoDevices.length <= 1) {
    // Only one camera, nothing to switch to
    return prevStream;
  }

  const nextIdx = getNextDeviceIndex();
  const nextDevice = videoDevices[nextIdx];
  if (!nextDevice) return prevStream;

  console.debug(`[Camera] Switching to device ${nextIdx + 1}/${videoDevices.length}: ${nextDevice.label || nextDevice.deviceId}`);

  return startCamera(videoEl, 'environment', prevStream, nextDevice.deviceId);
}

export function stopCamera(prevStream: MediaStream | null): null {
  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }
  return null;
}

// --- Torch / Flash ---

/**
 * Check if the current camera track supports torch/flash.
 * Uses multiple detection strategies for broad device compatibility:
 *   1. getCapabilities().torch (standard)
 *   2. getSettings().torch existence
 *   3. Probe: try to apply torch constraint and see if it throws
 *
 * Retries multiple times with increasing delays because some devices
 * (especially tablets) take time to fully initialize the camera track
 * before capabilities are reported correctly.
 */
export async function isTorchSupported(stream: MediaStream | null): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return false;

  // Skip entirely if the browser doesn't know about torch at all (e.g. Firefox, Safari)
  const supportedConstraints = navigator.mediaDevices.getSupportedConstraints() as any;
  if (!supportedConstraints.torch) return false;

  // Strategy 1 & 2: capabilities and settings
  // Retry with increasing delays for slow device initialization
  const delays = [0, 300, 600, 1000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
    // Track may have ended while we were waiting
    if (track.readyState !== 'live') return false;

    try {
      if (typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities() as any;
        if (capabilities?.torch === true) {
          console.debug(`[Torch] Detected via getCapabilities() on attempt ${attempt + 1}`);
          return true;
        }
      }

      const settings = track.getSettings() as any;
      if (settings && 'torch' in settings) {
        console.debug(`[Torch] Detected via getSettings() on attempt ${attempt + 1}`);
        return true;
      }
    } catch (e) {
      console.debug('Error checking torch support:', e);
    }
  }

  // Strategy 3: probe — actually try to set torch=false
  // This catches devices that don't report torch in capabilities but still support it
  try {
    await track.applyConstraints({ advanced: [{ torch: false }] } as any);
    console.debug('[Torch] Detected via probe (applyConstraints succeeded)');
    return true;
  } catch {
    // Constraint rejected — torch not supported on this lens
  }

  console.debug('[Torch] Not supported on this lens');
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
      await track.applyConstraints({ torch: enable } as any);
    } catch (e2) {
      console.error('Failed to toggle torch:', e2);
    }
  }
}

// --- Zoom ---

export interface ZoomCapabilities {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  current: number;
}

/** Query the zoom range supported by the current camera track. */
export function getZoomCapabilities(stream: MediaStream | null): ZoomCapabilities {
  const none: ZoomCapabilities = { supported: false, min: 1, max: 1, step: 0, current: 1 };
  if (!stream) return none;
  const track = stream.getVideoTracks()[0];
  if (!track) return none;

  try {
    const caps = track.getCapabilities?.() as any;
    if (!caps?.zoom) return none;
    const settings = track.getSettings() as any;
    return {
      supported: true,
      min: caps.zoom.min ?? 1,
      max: caps.zoom.max ?? 1,
      step: caps.zoom.step ?? 0.1,
      current: settings?.zoom ?? caps.zoom.min ?? 1,
    };
  } catch {
    return none;
  }
}

/** Set the zoom level on the current camera track. Returns the actual zoom set. */
export async function setZoom(stream: MediaStream | null, zoom: number): Promise<number> {
  if (!stream) return 1;
  const track = stream.getVideoTracks()[0];
  if (!track) return 1;

  try {
    const caps = track.getCapabilities?.() as any;
    if (!caps?.zoom) return 1;
    const clamped = Math.max(caps.zoom.min, Math.min(caps.zoom.max, zoom));
    await track.applyConstraints({ advanced: [{ zoom: clamped }] } as any);
    return clamped;
  } catch (e) {
    console.debug('[Zoom] Failed to set zoom:', e);
    return (track.getSettings() as any)?.zoom ?? 1;
  }
}

// --- Focus ---

export interface FocusCapabilities {
  tapToFocus: boolean;
  focusModes: string[];
}

/** Query focus capabilities of the current camera track. */
export function getFocusCapabilities(stream: MediaStream | null): FocusCapabilities {
  const none: FocusCapabilities = { tapToFocus: false, focusModes: [] };
  if (!stream) return none;
  const track = stream.getVideoTracks()[0];
  if (!track) return none;

  try {
    const caps = track.getCapabilities?.() as any;
    const modes: string[] = caps?.focusMode ?? [];
    // Tap-to-focus requires 'manual' or 'single-shot' mode + pointOfInterest support
    // Some devices support pointOfInterest with 'continuous' mode too
    const hasPointOfInterest = !!caps?.pointOfInterest;
    const hasSingleShot = modes.includes('single-shot');
    const hasManual = modes.includes('manual');
    return {
      tapToFocus: hasPointOfInterest || hasSingleShot || hasManual,
      focusModes: modes,
    };
  } catch {
    return none;
  }
}

/**
 * Trigger a tap-to-focus at the given point.
 * The point is in normalized coordinates (0..1, 0..1) relative to the video frame.
 * After focusing, switches back to continuous autofocus if supported.
 */
export async function tapToFocus(
  stream: MediaStream | null,
  normX: number,
  normY: number
): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return false;

  try {
    const caps = track.getCapabilities?.() as any;

    // Strategy 1: Use pointOfInterest with single-shot focus (best support on Android Chrome)
    if (caps?.pointOfInterest) {
      const constraints: any = {
        advanced: [{
          pointOfInterest: { x: normX, y: normY },
        }],
      };
      // Use single-shot if available for a one-time focus lock
      if (caps?.focusMode?.includes('single-shot')) {
        constraints.advanced[0].focusMode = 'single-shot';
      }
      await track.applyConstraints(constraints);
      console.debug(`[Focus] Tap-to-focus at (${normX.toFixed(2)}, ${normY.toFixed(2)})`);

      // After 2 seconds, switch back to continuous autofocus
      setTimeout(async () => {
        try {
          if (track.readyState === 'live' && caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any);
          }
        } catch { /* ignore — track may have ended */ }
      }, 2000);

      return true;
    }

    // Strategy 2: No pointOfInterest but has single-shot — trigger a re-focus
    if (caps?.focusMode?.includes('single-shot')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] } as any);
      console.debug('[Focus] Triggered single-shot re-focus (no pointOfInterest)');

      setTimeout(async () => {
        try {
          if (track.readyState === 'live' && caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any);
          }
        } catch { /* ignore */ }
      }, 2000);

      return true;
    }

    return false;
  } catch (e) {
    console.debug('[Focus] Tap-to-focus failed:', e);
    return false;
  }
}

// --- Photo Capture ---

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
