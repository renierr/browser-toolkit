/**
 * Shared utility for mapping between video-frame coordinates and display coordinates
 * when a video element uses `object-fit: contain`.
 *
 * Used by camera-gestures (screen → normalized) and detection (normalized → screen overlay).
 */

export interface ContainedRect {
  /** X offset of the displayed video area within the element */
  offsetX: number;
  /** Y offset of the displayed video area within the element */
  offsetY: number;
  /** Width of the displayed video area */
  width: number;
  /** Height of the displayed video area */
  height: number;
}

/**
 * Calculate the actual displayed rectangle of a video element using `object-fit: contain`.
 * The video may be letterboxed (bars top/bottom) or pillarboxed (bars left/right).
 *
 * @param videoWidth  Intrinsic video width (video.videoWidth)
 * @param videoHeight Intrinsic video height (video.videoHeight)
 * @param elemWidth   Display element width (clientWidth or getBoundingClientRect().width)
 * @param elemHeight  Display element height (clientHeight or getBoundingClientRect().height)
 */
export function getContainedVideoRect(
  videoWidth: number,
  videoHeight: number,
  elemWidth: number,
  elemHeight: number
): ContainedRect {
  const vidAspect = videoWidth / videoHeight;
  const elemAspect = elemWidth / elemHeight;

  if (vidAspect > elemAspect) {
    // Video wider than element → fills width, letterboxed top/bottom
    const w = elemWidth;
    const h = elemWidth / vidAspect;
    return { offsetX: 0, offsetY: (elemHeight - h) / 2, width: w, height: h };
  } else {
    // Video taller than element → fills height, pillarboxed left/right
    const h = elemHeight;
    const w = elemHeight * vidAspect;
    return { offsetX: (elemWidth - w) / 2, offsetY: 0, width: w, height: h };
  }
}

/**
 * Convert a client-space position on an `object-contain` video element
 * to normalized (0..1) video-frame coordinates.
 * Returns null if the position is outside the displayed video area.
 */
export function clientToNormalizedVideo(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number
): { normX: number; normY: number } | null {
  const rect = video.getBoundingClientRect();
  if (!video.videoWidth || !video.videoHeight) return null;

  const display = getContainedVideoRect(
    video.videoWidth,
    video.videoHeight,
    rect.width,
    rect.height
  );

  const relX = clientX - rect.left - display.offsetX;
  const relY = clientY - rect.top - display.offsetY;

  if (relX < 0 || relX > display.width || relY < 0 || relY > display.height) return null;

  return { normX: relX / display.width, normY: relY / display.height };
}

/**
 * Convert normalized (0..1) video-frame coordinates to overlay pixel coordinates,
 * accounting for the `object-contain` display area.
 */
export function normalizedToOverlay(
  points: { x: number; y: number }[],
  displayRect: ContainedRect
): { x: number; y: number }[] {
  return points.map((p) => ({
    x: displayRect.offsetX + p.x * displayRect.width,
    y: displayRect.offsetY + p.y * displayRect.height,
  }));
}
