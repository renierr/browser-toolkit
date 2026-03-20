/**
 * Shared camera utilities for tools that need camera access.
 *
 * Provides: start/stop, device enumeration & switching, torch/flash,
 * zoom, tap-to-focus, and photo capture.
 *
 * Module-level state (device list, current index) is scoped to this module.
 * Call resetCameraState() on tool cleanup to prevent stale state across
 * tool navigation.
 */

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

function getNextDeviceIndex(): number {
  if (videoDevices.length === 0) return -1;
  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  return currentDeviceIndex;
}

function updateCurrentDeviceIndex(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const deviceId = track.getSettings().deviceId;
  if (deviceId) {
    const idx = videoDevices.findIndex((d) => d.deviceId === deviceId);
    if (idx >= 0) currentDeviceIndex = idx;
  }
}

/** Returns the number of available video devices (call after startCamera). */
export function getVideoDeviceCount(): number {
  return videoDevices.length;
}

// --- Camera Start/Stop ---

export interface StartCameraOptions {
  videoEl: HTMLVideoElement;
  facingMode?: 'user' | 'environment';
  prevStream?: MediaStream | null;
  deviceId?: string;
  /** Ideal resolution width (default 1920) */
  width?: number;
  /** Ideal resolution height (default 1080) */
  height?: number;
}

export async function startCamera(opts: StartCameraOptions): Promise<MediaStream | null> {
  const {
    videoEl,
    facingMode = 'environment',
    prevStream = null,
    deviceId,
    width = 1920,
    height = 1080,
  } = opts;

  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }

  try {
    const videoConstraints: MediaTrackConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 30, max: 60 },
        }
      : {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
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
          console.debug('[Camera] Focus mode not supported or failed to apply', e);
        }
      }
    }

    videoEl.srcObject = stream;
    videoEl.play().catch((e) => console.warn('[Camera] Auto-play prevented:', e));

    // Enumerate devices after first getUserMedia (needed for labels)
    await enumerateVideoDevices();
    updateCurrentDeviceIndex(stream);

    return stream;
  } catch (err) {
    console.error('[Camera] Error:', err);
    return null;
  }
}

export function stopCamera(prevStream: MediaStream | null): null {
  if (prevStream) {
    prevStream.getTracks().forEach((t) => t.stop());
  }
  return null;
}

/**
 * Switch to the next available camera lens/device.
 * Returns the new stream, or the previous stream if only one camera exists.
 */
export async function switchToNextCamera(
  videoEl: HTMLVideoElement,
  prevStream: MediaStream | null
): Promise<MediaStream | null> {
  if (videoDevices.length <= 1) return prevStream;

  const nextIdx = getNextDeviceIndex();
  const nextDevice = videoDevices[nextIdx];
  if (!nextDevice) return prevStream;

  console.debug(
    `[Camera] Switching to device ${nextIdx + 1}/${videoDevices.length}: ${nextDevice.label || nextDevice.deviceId}`
  );
  return startCamera({ videoEl, prevStream, deviceId: nextDevice.deviceId });
}

// --- Torch / Flash ---

/**
 * Check if the current camera track supports torch/flash.
 * Uses multiple detection strategies with retries for broad device compatibility.
 */
export async function isTorchSupported(stream: MediaStream | null): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return false;

  const supportedConstraints = navigator.mediaDevices.getSupportedConstraints() as any;
  if (!supportedConstraints.torch) return false;

  const delays = [0, 300, 600, 1000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
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
      console.debug('[Torch] Error checking support:', e);
    }
  }

  // Probe: try to apply torch constraint
  try {
    await track.applyConstraints({ advanced: [{ torch: false }] } as any);
    console.debug('[Torch] Detected via probe');
    return true;
  } catch {
    // Not supported
  }

  console.debug('[Torch] Not supported on this lens');
  return false;
}

export async function toggleTorch(stream: MediaStream | null, enable: boolean): Promise<void> {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  try {
    await track.applyConstraints({ advanced: [{ torch: enable }] } as any);
  } catch (e) {
    console.warn('[Torch] Failed with advanced constraints, trying direct fallback', e);
    try {
      await track.applyConstraints({ torch: enable } as any);
    } catch (e2) {
      console.error('[Torch] Failed to toggle:', e2);
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

export function getFocusCapabilities(stream: MediaStream | null): FocusCapabilities {
  const none: FocusCapabilities = { tapToFocus: false, focusModes: [] };
  if (!stream) return none;
  const track = stream.getVideoTracks()[0];
  if (!track) return none;

  try {
    const caps = track.getCapabilities?.() as any;
    const modes: string[] = caps?.focusMode ?? [];
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
 * Trigger a tap-to-focus at the given normalized point (0..1, 0..1).
 * After focusing, reverts to continuous autofocus after 2 seconds if supported.
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

    // Strategy 1: pointOfInterest + single-shot (best on Android Chrome)
    if (caps?.pointOfInterest) {
      const constraints: any = {
        advanced: [{ pointOfInterest: { x: normX, y: normY } }],
      };
      if (caps?.focusMode?.includes('single-shot')) {
        constraints.advanced[0].focusMode = 'single-shot';
      }
      await track.applyConstraints(constraints);
      console.debug(`[Focus] Tap-to-focus at (${normX.toFixed(2)}, ${normY.toFixed(2)})`);

      setTimeout(async () => {
        try {
          if (track.readyState === 'live' && caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any);
          }
        } catch {
          /* track may have ended */
        }
      }, 2000);
      return true;
    }

    // Strategy 2: single-shot only
    if (caps?.focusMode?.includes('single-shot')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] } as any);
      console.debug('[Focus] Triggered single-shot re-focus');

      setTimeout(async () => {
        try {
          if (track.readyState === 'live' && caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any);
          }
        } catch {
          /* ignore */
        }
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

  // 1. ImageCapture API (the best resolution, Chrome/Android)
  if ('ImageCapture' in window) {
    try {
      const imageCapture = new (window as any).ImageCapture(track);
      blob = await imageCapture.takePhoto();
    } catch (e) {
      console.warn('[Capture] ImageCapture failed, falling back to video frame', e);
    }
  }

  // 2. Fallback: canvas capture (essential for iOS/Safari)
  if (!blob) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  }

  return blob;
}
