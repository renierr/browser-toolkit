/**
 * Live detection loop orchestration: manages the rAF detection loop,
 * display-side corner interpolation, stability tracking, and auto-snap countdown.
 *
 * All state is scoped to the instance returned by createLiveDetectionLoop().
 */
import type { Point } from './perspective';
import {
  calculateLiveDetection,
  isStable,
  resetDetectionHistory,
} from './detection';
import { drawLiveOverlay } from './ui';

// --- Configuration ---

const LERP_SPEED = 0.25;
const STABLE_FRAMES_BEFORE_COUNTDOWN = 20;

// --- Types ---

export interface LiveDetectionDeps {
  video: HTMLVideoElement;
  detectionCanvas: HTMLCanvasElement;
  dCtx: CanvasRenderingContext2D;
  cameraOverlay: HTMLCanvasElement;
  checkLiveDetection: HTMLInputElement;
  autoSnapCountdown: HTMLElement;
  autoSnapNumber: HTMLElement;
  isDebugMode: () => boolean;
  onAutoCapture: () => void;
}

export interface LiveDetectionLoop {
  start(): void;
  stop(): void;
  getLastDetectedCorners(): Point[] | null;
  destroy(): void;
}

// --- Helpers ---

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// --- Factory ---

export function createLiveDetectionLoop(deps: LiveDetectionDeps): LiveDetectionLoop {
  const {
    video, detectionCanvas, dCtx, cameraOverlay, checkLiveDetection,
    autoSnapCountdown, autoSnapNumber, isDebugMode, onAutoCapture,
  } = deps;

  // All state is local to this closure
  let detectionFrameId: number | null = null;
  let detectionFrameCounter = 0;
  let stableCount = 0;
  let lastResult: Point[] | null = null;
  let displayCorners: Point[] | null = null;
  let targetCorners: Point[] | null = null;
  let targetColor = '#00FF00';
  let countdownValue = 0;
  let countdownTimerId: ReturnType<typeof setInterval> | null = null;
  let detectingInProgress = false;

  // --- Countdown ---

  function startCountdown() {
    if (countdownTimerId) return;
    countdownValue = 3;
    autoSnapCountdown.classList.remove('hidden');
    autoSnapNumber.textContent = '3';

    countdownTimerId = setInterval(() => {
      countdownValue--;
      if (countdownValue > 0) {
        autoSnapNumber.textContent = String(countdownValue);
      } else {
        cancelCountdown();
        stableCount = 0;
        onAutoCapture();
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    countdownValue = 0;
    autoSnapCountdown.classList.add('hidden');
    autoSnapNumber.textContent = '';
  }

  // --- Reset ---

  function resetState() {
    if (detectionFrameId) {
      cancelAnimationFrame(detectionFrameId);
      detectionFrameId = null;
    }
    cancelCountdown();
    resetDetectionHistory();
    targetCorners = null;
    displayCorners = null;
    stableCount = 0;
    lastResult = null;
    detectionFrameCounter = 0;
    detectingInProgress = false;
  }

  // --- Loop ---

  function loop() {
    if (video.paused || video.ended || !checkLiveDetection.checked) {
      resetState();
      return;
    }

    // Display-side interpolation: run every frame for smooth overlay
    if (targetCorners && displayCorners) {
      displayCorners = displayCorners.map((dp, i) =>
        lerpPoint(dp, targetCorners![i], LERP_SPEED)
      );
      drawLiveOverlay(cameraOverlay, displayCorners, targetColor);
    } else if (targetCorners && !displayCorners) {
      displayCorners = targetCorners.map((p) => ({ ...p }));
      drawLiveOverlay(cameraOverlay, displayCorners, targetColor);
    }

    // Detection: throttle to every 4th frame (~15fps on 60fps)
    detectionFrameCounter++;
    if (detectionFrameCounter % 4 === 0 && !detectingInProgress) {
      detectingInProgress = true;

      calculateLiveDetection(video, detectionCanvas, dCtx, cameraOverlay, isDebugMode())
        .then((result) => {
          detectingInProgress = false;
          if (result === null) return;

          if (isDebugMode()) {
            console.log(
              `[Scanner Debug] Frame ${detectionFrameCounter} | Stable: ${stableCount} | Countdown: ${countdownValue} | Found: ${result?.upscaled ? 'yes' : 'no'}`
            );
          }

          if (result.upscaled) {
            targetCorners = result.upscaled;

            if (isStable(lastResult, result.lastDetectedCorners)) {
              stableCount++;
            } else {
              stableCount = 0;
              cancelCountdown();
            }
            lastResult = result.lastDetectedCorners;

            targetColor = stableCount > 6 ? '#FFD700' : '#00FF00';

            if (!isDebugMode() && stableCount >= STABLE_FRAMES_BEFORE_COUNTDOWN && !countdownTimerId) {
              startCountdown();
            }
          } else {
            targetCorners = null;
            displayCorners = null;
            const oCtx = cameraOverlay.getContext('2d');
            if (oCtx) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
            stableCount = 0;
            lastResult = null;
            cancelCountdown();
          }
        })
        .catch(() => {
          detectingInProgress = false;
        });
    }

    detectionFrameId = requestAnimationFrame(loop);
  }

  // --- Public API ---

  return {
    start() {
      if (detectionFrameId) return;
      detectionFrameId = requestAnimationFrame(loop);
    },

    stop() {
      resetState();
      const oCtx = cameraOverlay.getContext('2d');
      if (oCtx) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    },

    getLastDetectedCorners() {
      return lastResult;
    },

    destroy() {
      resetState();
    },
  };
}
