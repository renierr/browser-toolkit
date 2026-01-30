import { downloadFile } from '../../js/file-utils.ts';
import { showMessage } from '../../js/ui.ts';
import {
  loadSettings,
  resetToDefaults,
  saveSettings,
} from './settings.ts';
import { getDomElements } from './dom.ts';
import type { CurveMode, Point, RDPMode, SignatureData } from './signature-types.ts';

// --- Configuration ---

let MOVE_TOLERANCE = 2; // Ignore mouse moves smaller than 2px
let MIN_WIDTH_FACTOR = 0.15; // Thin lines can be x% of base width
let MAX_WIDTH_FACTOR = 2.0; // allow up to x% of base width
let VELOCITY_SENSITIVITY = 0.85; // larger -> velocity reduces width more strongly
let PRESSURE_INFLUENCE = 0.9; // how strongly pressure scales width (0..1)
let VELOCITY_INFLUENCE = 0.8; // how strongly velocity scaling contributes (0..1)
let WIDTH_SMOOTHING = 0.25; // 0..1 where higher keeps more of previous width (0.65 is a gentle smoothing)

// Single storage key for both basic and advanced signature settings

// --- IndexedDB Helper (lightweight) ---
const DB_NAME = 'bt-signatures-db';
const DB_STORE = 'signatures';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllSignatures(): Promise<SignatureData[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      // Return in reverse chronological order (most recent first)
      const res = ((req.result as SignatureData[]) || []).sort((a, b) => b.timestamp - a.timestamp);
      resolve(res);
    };
    req.onerror = () => reject(req.error);
  });
}

async function putSignature(sig: SignatureData): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.put(sig);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteSignature(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// --- Helper: Math & Geometry ---

function computeWidthFromVelocityAndPressure(
  velocity: number,
  pressure: number,
  baseWidth: number
) {
  // Normalize inputs
  const p = Math.max(0, Math.min(1, pressure ?? 1));
  const v = Math.max(0, velocity ?? 0);

  const velocityFactor = Math.exp(-v * VELOCITY_SENSITIVITY);
  const pressureScale = 0.5 + p * PRESSURE_INFLUENCE; // ranges ~0.5..(0.5+PRESSURE_INFLUENCE)
  const velocityScale = 0.5 + velocityFactor * VELOCITY_INFLUENCE; // ranges ~0.5..(0.5+VELOCITY_INFLUENCE)

  let width = baseWidth * pressureScale * velocityScale;

  // Apply reasonable clamps to avoid disappearing or huge strokes
  const minW = baseWidth * MIN_WIDTH_FACTOR;
  const maxW = baseWidth * MAX_WIDTH_FACTOR;
  width = Math.max(minW, Math.min(maxW, width));

  return width;
}

function computeSegmentWidth(p0: Point, p1: Point, baseWidth: number) {
  const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  let dt = p1.timestamp - p0.timestamp;
  if (!dt || dt < 1) dt = 1; // avoid division by zero / extremely large velocities
  const velocity = dist / dt; // pixels per ms
  const pressureAvg = ((p0.pressure || 1) + (p1.pressure || 1)) / 2;
  return computeWidthFromVelocityAndPressure(velocity, pressureAvg, baseWidth);
}

// Catmull-Rom to Cubic Bezier Control Points
const getCatmullRomControlPoints = (p0: Point, p1: Point, p2: Point, p3: Point) => {
  return {
    c1x: p1.x + (p2.x - p0.x) / 6,
    c1y: p1.y + (p2.y - p0.y) / 6,
    c2x: p2.x - (p3.x - p1.x) / 6,
    c2y: p2.y - (p3.y - p1.y) / 6,
  };
};

function buildNormalizedFromPaths(paths: Point[][], baseWidth: number) {
  // Calculate Bounds & Normalize
  const flat = paths.flat();
  const minX = Math.min(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y));
  const maxX = Math.max(...flat.map((p) => p.x));
  const maxY = Math.max(...flat.map((p) => p.y));

  const padding = baseWidth * 2;
  const logicalWidth = maxX - minX + padding * 2;
  const logicalHeight = maxY - minY + padding * 2;

  // Shift paths to start at (0,0) for storage portability
  const normalizedPaths: Point[][] = paths.map((path) =>
    path.map((p) => ({
      x: p.x - minX + padding,
      y: p.y - minY + padding,
      timestamp: p.timestamp,
      pressure: p.pressure,
    }))
  );
  return { normalizedPaths, logicalWidth, logicalHeight };
}

function perpendicularDistanceSq(p: Point, p0: Point, p1: Point): number {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (dx === 0 && dy === 0) {
    // p0 und p1 sind identisch → Distanz zu p0
    return (p.x - p0.x) ** 2 + (p.y - p0.y) ** 2;
  }

  const t = ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / (dx * dx + dy * dy);
  const tClamped = Math.max(0, Math.min(1, t)); // Projektion auf das Segment

  const projX = p0.x + tClamped * dx;
  const projY = p0.y + tClamped * dy;

  const distX = p.x - projX;
  const distY = p.y - projY;
  return distX * distX + distY * distY;
}

function simplifyRDP(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();

  const result: Point[] = [];
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistSq = 0;
    let maxIndex = 0;

    for (let i = start + 1; i < end; i++) {
      const distSq = perpendicularDistanceSq(points[i], points[start], points[end]);
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        maxIndex = i;
      }
    }

    if (maxDistSq > epsilon * epsilon) {
      stack.push([maxIndex, end]);
      stack.push([start, maxIndex]);
    } else {
      result.push(points[start]);
    }
  }

  result.push(points[points.length - 1]);
  result.sort((a, b) => points.indexOf(a) - points.indexOf(b));
  return result;
}

// --- Helper: Rendering ---

function drawSignaturePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number,
  mode: CurveMode
) {
  if (!points || points.length === 0) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, baseWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Draw segment-by-segment for variable width
  if (mode === 'fast') {
    // Quadratic Curve (Midpoint approximation)
    let p1 = points[0];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);

    let prevWidth = baseWidth;

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const rawW = computeSegmentWidth(p1, p2, baseWidth);
      const w = prevWidth * WIDTH_SMOOTHING + rawW * (1 - WIDTH_SMOOTHING);

      ctx.lineWidth = w;
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);

      p1 = p2;
      prevWidth = w;
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else if (mode === 'natural') {
    let recentVels: number[] = [];
    let recentPressures: number[] = [];

    // Natural: Cubic Bezier (Catmull-Rom)
    let prevWidth = baseWidth;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const dt = Math.max(1, p2.timestamp - p1.timestamp);
      const vel = dist / dt;
      const pressAvg = ((p1.pressure || 1) + (p2.pressure || 1)) / 2;

      recentVels.push(vel);
      recentPressures.push(pressAvg);
      if (recentVels.length > 5) recentVels.shift(); // max 5 segments
      if (recentPressures.length > 5) recentPressures.shift();

      const avgVel = recentVels.reduce((a, b) => a + b, 0) / recentVels.length;
      const avgPress = recentPressures.reduce((a, b) => a + b, 0) / recentPressures.length;

      const rawWidth = computeWidthFromVelocityAndPressure(avgVel, avgPress, baseWidth);
      const w = prevWidth * WIDTH_SMOOTHING + rawWidth * (1 - WIDTH_SMOOTHING);
      prevWidth = w;

      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
      ctx.stroke();
    }
  } else if (mode === 'draft') {
    let p1 = points[0];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineCap = 'round';

    let prevWidth = baseWidth;

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const rawW = computeSegmentWidth(p1, p2, baseWidth);
      const w = prevWidth * WIDTH_SMOOTHING + rawW * (1 - WIDTH_SMOOTHING);
      ctx.lineWidth = w;
      ctx.moveTo(p1.x, p1.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineTo(p2.x, p2.y);
      p1 = p2;
      prevWidth = w;
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else {
    // None: Raw strokes - straight segments with constant width
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

// --- Helper: High Res Export ---

function generatePng(
  paths: Point[][],
  color: string,
  baseWidth: number,
  targetDpi: number,
  logicalWidth: number,
  logicalHeight: number,
  mode: CurveMode = 'natural'
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    // Scale Factor (72 DPI is base)
    const scaleFactor = targetDpi / 72;

    // Setup Canvas
    const exportW = Math.ceil(logicalWidth * scaleFactor);
    const exportH = Math.ceil(logicalHeight * scaleFactor);

    const canvas = document.createElement('canvas');
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext('2d')!;

    // Draw Scaled & Translated
    ctx.scale(scaleFactor, scaleFactor);

    paths.forEach((path) => {
      drawSignaturePath(ctx, path, color, baseWidth, mode);
    });

    canvas.toBlob((blob) => {
      if (blob) resolve({ blob, width: exportW, height: exportH });
    }, 'image/png');
  });
}

// --- Helper: Optimized SVG ---

function generateSvg(
  paths: Point[][],
  width: number,
  height: number,
  color: string,
  baseWidth: number,
  mode: CurveMode = 'natural'
): string {
  const f = (n: number) => {
    const s = n.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  let content = '';

  paths.forEach((path) => {
    if (!path || path.length === 0) return;

    if (path.length === 1) {
      content += `<circle cx="${f(path[0].x)}" cy="${f(path[0].y)}" r="${f(baseWidth / 2)}" fill="${color}" />\n`;
      return;
    }

    // Draw using Cubic Beziers for max compression and smoothness
    if (mode === 'none') {
      // Simple polyline/path for raw strokes
      let d = `M${f(path[0].x)} ${f(path[0].y)}`;
      for (let i = 1; i < path.length; i++) d += ` L${f(path[i].x)} ${f(path[i].y)}`;
      content += `<path d="${d}" stroke-width="${f(baseWidth)}" />\n`;
    } else {
      let prevWidth = baseWidth;
      for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];

        const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
        const rawW = computeSegmentWidth(p1, p2, baseWidth);
        const w = prevWidth * WIDTH_SMOOTHING + rawW * (1 - WIDTH_SMOOTHING);
        prevWidth = w;

        const d = `M${f(p1.x)} ${f(p1.y)} C${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
        content += `<path d="${d}" stroke-width="${f(w)}" />\n`;
      }
    }
  });

  return `<svg width="${f(width)}" height="${f(height)}" viewBox="0 0 ${f(width)} ${f(height)}" xmlns="http://www.w3.org/2000/svg"><g stroke="${color}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n${content}</g></svg>`;
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const dom = getDomElements(document);
  const currentDpiValue = () => {
    return parseInt(dom.dpiInput.value) || 96;
  };

  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;

  // Performance Buffer: Stores "dried" ink to keep the UI snappy
  const memCanvas = document.createElement('canvas');
  const memCtx = memCanvas.getContext('2d')!;

  let isDrawing = false;
  let paths: Point[][] = [];
  let currentPath: Point[] = [];

  let redrawTimeout: number | null = null;
  let currentStrokeWidth = parseInt(dom.penWidthInput.value);
  let currentCurveMode: CurveMode = (dom.curveModeSelect.value as CurveMode) || 'natural';
  let prevLiveWidth = currentStrokeWidth;

  const dpr = window.devicePixelRatio || 1;
  const userWidth = () => dom.canvas.width / dpr;
  const userHeight = () => dom.canvas.height / dpr;

  // Set initial display values
  if (dom.penWidthValue) dom.penWidthValue.textContent = dom.penWidthInput.value;

  // Load persisted settings (both advanced and basic) and apply to UI/runtime
  const settings = loadSettings();
  // Advanced numeric settings (preserve defaults if missing)
  MOVE_TOLERANCE = settings.MOVE_TOLERANCE ?? MOVE_TOLERANCE;
  MIN_WIDTH_FACTOR = settings.MIN_WIDTH_FACTOR ?? MIN_WIDTH_FACTOR;
  MAX_WIDTH_FACTOR = settings.MAX_WIDTH_FACTOR ?? MAX_WIDTH_FACTOR;
  VELOCITY_SENSITIVITY = settings.VELOCITY_SENSITIVITY ?? VELOCITY_SENSITIVITY;
  PRESSURE_INFLUENCE = settings.PRESSURE_INFLUENCE ?? PRESSURE_INFLUENCE;
  VELOCITY_INFLUENCE = settings.VELOCITY_INFLUENCE ?? VELOCITY_INFLUENCE;
  WIDTH_SMOOTHING = settings.WIDTH_SMOOTHING ?? WIDTH_SMOOTHING;

  // Basic UI settings
  if (settings.color && typeof settings.color === 'string') {
    dom.penColorInput!.value = settings.color;
  }
  if (settings.strokeWidth && !isNaN(parseInt(settings.strokeWidth))) {
    dom.penWidthInput.value = String(settings.strokeWidth);
    currentStrokeWidth = parseInt(dom.penWidthInput.value);
    if (dom.penWidthValue) dom.penWidthValue.textContent = dom.penWidthInput.value;
  }
  if (settings.curveMode && typeof settings.curveMode === 'string') {
    dom.curveModeSelect.value = settings.curveMode;
    currentCurveMode = dom.curveModeSelect.value as CurveMode;
  }
  if (settings.rdp && typeof settings.rdp === 'string') {
    dom.rdpModeSelect.value = settings.rdp;
  }
  if (settings.dpi && !isNaN(parseInt(settings.dpi))) {
    dom.dpiInput.value = String(parseInt(settings.dpi));
  }

  // --- Sizing ---
  const syncCanvasSize = () => {
    const rect = dom.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (dom.canvas.width !== rect.width * dpr || dom.canvas.height !== rect.height * dpr) {
      dom.canvas.width = memCanvas.width = rect.width * dpr;
      dom.canvas.height = memCanvas.height = rect.height * dpr;

      // Normalize context to use CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      memCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawStatic();
    }
  };

  function debouncedRedraw() {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    redrawTimeout = window.setTimeout(() => {
      memCtx.clearRect(0, 0, userWidth(), userHeight());
      paths.forEach((p) => {
        drawSignaturePath(memCtx, p, dom.penColorInput.value, currentStrokeWidth, currentCurveMode);
      });
      drawStatic();
      redrawTimeout = null;
    }, 100);
  }

  function getPos(e: PointerEvent): Point {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      timestamp: performance.now(),
      pressure: e.pressure || 1,
    };
  }

  function drawStatic() {
    // Clear visible canvas in user units, then draw the baked memCanvas scaled to user units.
    ctx!.clearRect(0, 0, userWidth(), userHeight());
    ctx!.drawImage(memCanvas, 0, 0, userWidth(), userHeight());
  }

  function startDrawing(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    isDrawing = true;
    currentPath = [getPos(e)];
    prevLiveWidth = currentStrokeWidth;

    dom.canvas.setPointerCapture(e.pointerId);
  }

  function draw(e: PointerEvent) {
    if (!isDrawing) return;
    const pos = getPos(e);
    const prev = currentPath[currentPath.length - 1];

    // Cheap threshold check
    if (prev) {
      const distSq = (pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2;
      if (distSq < MOVE_TOLERANCE * MOVE_TOLERANCE) return;
    }

    currentPath.push(pos);

    // DRAFT MODE: Additive drawing only
    // We only draw the new segment on top of the existing canvas.
    if (currentPath.length > 1) {
      const p0 = currentPath[currentPath.length - 2];
      const p1 = currentPath[currentPath.length - 1];
      ctx!.beginPath();
      const rawSegmentW = computeSegmentWidth(p0, p1, currentStrokeWidth);
      const liveW = prevLiveWidth * WIDTH_SMOOTHING + rawSegmentW * (1 - WIDTH_SMOOTHING);
      prevLiveWidth = liveW;
      ctx!.lineWidth = liveW;
      ctx!.lineCap = 'round';
      ctx!.strokeStyle = dom.penColorInput.value;
      ctx!.moveTo(p0.x, p0.y);
      ctx!.lineTo(p1.x, p1.y);
      ctx!.stroke();
    }
    e.preventDefault();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    const currentRDPMode: RDPMode = (dom.rdpModeSelect.value as RDPMode) || 'none';
    let epsilon = 0;

    if (currentRDPMode === 'low') {
      epsilon = 0.5;
    } else if (currentRDPMode === 'medium') {
      epsilon = 1.0;
    } else if (currentRDPMode === 'high') {
      epsilon = 1.5;
    }
    const simplified = epsilon > 0 ? simplifyRDP(currentPath, epsilon) : currentPath;

    // Bake High-Quality Curve (Correction)
    drawSignaturePath(
      memCtx,
      simplified,
      dom.penColorInput.value,
      currentStrokeWidth,
      currentCurveMode
    );

    paths.push(simplified);
    currentPath = [];
    drawStatic();
  }

  // --- Listeners & Observers ---

  const resizeObserver = new ResizeObserver(() => syncCanvasSize());
  resizeObserver.observe(dom.canvas);
  syncCanvasSize();

  dom.canvas.addEventListener('pointerdown', startDrawing, { passive: false });
  dom.canvas.addEventListener('pointermove', draw, { passive: false });
  window.addEventListener('pointerup', stopDrawing, { passive: false });
  dom.canvas.addEventListener('pointercancel', stopDrawing, { passive: false });
  dom.canvas.style.touchAction = 'none';
  dom.canvasContainer.style.touchAction = 'none';

  // Basic UI listeners
  dom.penColorInput.addEventListener('input', () => {
    debouncedRedraw();
    saveSettings({ color: dom.penColorInput.value });
  });

  dom.penWidthInput.addEventListener('input', () => {
    currentStrokeWidth = parseInt(dom.penWidthInput.value);
    dom.penWidthValue.textContent = dom.penWidthInput.value;
    debouncedRedraw();
    saveSettings({ strokeWidth: currentStrokeWidth });
  });

  dom.curveModeSelect.addEventListener('change', () => {
    currentCurveMode = dom.curveModeSelect.value as CurveMode;
    debouncedRedraw();
    saveSettings({ curveMode: currentCurveMode });
  });

  dom.rdpModeSelect.addEventListener('change', () => {
    saveSettings({ rdp: dom.rdpModeSelect.value });
  });

  dom.dpiInput.addEventListener('change', () => {
    if (dom.dpiInput.value) saveSettings({ dpi: dom.dpiInput.value });
  });

  // Advanced controls
  const moveToleranceInput = document.getElementById('move-tolerance') as HTMLInputElement | null;
  const moveToleranceValue = document.getElementById('move-tolerance-value');
  const minWidthFactorInput = document.getElementById(
    'min-width-factor'
  ) as HTMLInputElement | null;
  const minWidthFactorValue = document.getElementById('min-width-factor-value');
  const maxWidthFactorInput = document.getElementById(
    'max-width-factor'
  ) as HTMLInputElement | null;
  const maxWidthFactorValue = document.getElementById('max-width-factor-value');
  const velocitySensitivityInput = document.getElementById(
    'velocity-sensitivity'
  ) as HTMLInputElement | null;
  const velocitySensitivityValue = document.getElementById('velocity-sensitivity-value');
  const pressureInfluenceInput = document.getElementById(
    'pressure-influence'
  ) as HTMLInputElement | null;
  const pressureInfluenceValue = document.getElementById('pressure-influence-value');
  const velocityInfluenceInput = document.getElementById(
    'velocity-influence'
  ) as HTMLInputElement | null;
  const velocityInfluenceValue = document.getElementById('velocity-influence-value');
  const widthSmoothingInput = document.getElementById('width-smoothing') as HTMLInputElement | null;
  const widthSmoothingValue = document.getElementById('width-smoothing-value');

  if (moveToleranceInput && moveToleranceValue) {
    moveToleranceInput.value = String(MOVE_TOLERANCE);
    moveToleranceValue.textContent = String(MOVE_TOLERANCE);
  }
  if (minWidthFactorInput && minWidthFactorValue) {
    minWidthFactorInput.value = String(MIN_WIDTH_FACTOR);
    minWidthFactorValue.textContent = String(MIN_WIDTH_FACTOR);
  }
  if (maxWidthFactorInput && maxWidthFactorValue) {
    maxWidthFactorInput.value = String(MAX_WIDTH_FACTOR);
    maxWidthFactorValue.textContent = String(MAX_WIDTH_FACTOR);
  }
  if (velocitySensitivityInput && velocitySensitivityValue) {
    velocitySensitivityInput.value = String(VELOCITY_SENSITIVITY);
    velocitySensitivityValue.textContent = String(VELOCITY_SENSITIVITY);
  }
  if (pressureInfluenceInput && pressureInfluenceValue) {
    pressureInfluenceInput.value = String(PRESSURE_INFLUENCE);
    pressureInfluenceValue.textContent = String(PRESSURE_INFLUENCE);
  }
  if (velocityInfluenceInput && velocityInfluenceValue) {
    velocityInfluenceInput.value = String(VELOCITY_INFLUENCE);
    velocityInfluenceValue.textContent = String(VELOCITY_INFLUENCE);
  }
  if (widthSmoothingInput && widthSmoothingValue) {
    widthSmoothingInput.value = String(WIDTH_SMOOTHING);
    widthSmoothingValue.textContent = String(WIDTH_SMOOTHING);
  }

  // Listeners to update runtime config
  moveToleranceInput?.addEventListener('input', () => {
    MOVE_TOLERANCE = parseInt(moveToleranceInput.value);
    moveToleranceValue && (moveToleranceValue.textContent = moveToleranceInput.value);
    saveSettings({ MOVE_TOLERANCE });
  });
  minWidthFactorInput?.addEventListener('input', () => {
    MIN_WIDTH_FACTOR = parseFloat(minWidthFactorInput.value);
    minWidthFactorValue && (minWidthFactorValue.textContent = minWidthFactorInput.value);
    debouncedRedraw();
    saveSettings({ MIN_WIDTH_FACTOR });
  });
  maxWidthFactorInput?.addEventListener('input', () => {
    MAX_WIDTH_FACTOR = parseFloat(maxWidthFactorInput.value);
    maxWidthFactorValue && (maxWidthFactorValue.textContent = maxWidthFactorInput.value);
    debouncedRedraw();
    saveSettings({ MAX_WIDTH_FACTOR });
  });
  velocitySensitivityInput?.addEventListener('input', () => {
    VELOCITY_SENSITIVITY = parseFloat(velocitySensitivityInput.value);
    velocitySensitivityValue &&
      (velocitySensitivityValue.textContent = velocitySensitivityInput.value);
    debouncedRedraw();
    saveSettings({ VELOCITY_SENSITIVITY });
  });
  pressureInfluenceInput?.addEventListener('input', () => {
    PRESSURE_INFLUENCE = parseFloat(pressureInfluenceInput.value);
    pressureInfluenceValue && (pressureInfluenceValue.textContent = pressureInfluenceInput.value);
    debouncedRedraw();
    saveSettings({ PRESSURE_INFLUENCE });
  });
  velocityInfluenceInput?.addEventListener('input', () => {
    VELOCITY_INFLUENCE = parseFloat(velocityInfluenceInput.value);
    velocityInfluenceValue && (velocityInfluenceValue.textContent = velocityInfluenceInput.value);
    debouncedRedraw();
    saveSettings({ VELOCITY_INFLUENCE });
  });
  widthSmoothingInput?.addEventListener('input', () => {
    WIDTH_SMOOTHING = parseFloat(widthSmoothingInput.value);
    widthSmoothingValue && (widthSmoothingValue.textContent = widthSmoothingInput.value);
    debouncedRedraw();
    saveSettings({ WIDTH_SMOOTHING });
  });

  // Reset to defaults button
  dom.resetBtn.addEventListener('click', () => {
    resetToDefaults();
    debouncedRedraw();
  });

  // --- Controls ---

  dom.clearBtn.addEventListener('click', () => {
    paths = [];
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    ctx.clearRect(0, 0, userWidth(), userHeight());
    prevLiveWidth = currentStrokeWidth;
  });

  dom.saveBtn.addEventListener('click', async () => {
    if (paths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      paths,
      currentStrokeWidth
    );

    // Generate Preview Image
    const { blob } = await generatePng(
      normalizedPaths,
      dom.penColorInput.value,
      currentStrokeWidth,
      72,
      logicalWidth,
      logicalHeight,
      currentCurveMode
    );

    // Save
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const signature: SignatureData = {
        id: crypto.randomUUID(),
        image: reader.result as string,
        width: logicalWidth,
        height: logicalHeight,
        timestamp: Date.now(),
        color: dom.penColorInput.value,
        strokeWidth: currentStrokeWidth,
        rawPaths: normalizedPaths,
      };

      // Persist into IndexedDB
      await putSignature(signature);

      // Cleanup
      paths = [];
      memCtx.clearRect(0, 0, userWidth(), userHeight());
      drawStatic();
      void renderSignatures();
    };
  });

  dom.copyClipboardBtn.addEventListener('click', async () => {
    if (paths.length === 0 && currentPath.length === 0) {
      showMessage('No signature to copy.', { type: 'warning', timeoutMs: 5000 });
    }

    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const dpi = currentDpiValue();
    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentStrokeWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      dom.penColorInput.value,
      currentStrokeWidth,
      dpi,
      logicalWidth,
      logicalHeight,
      currentCurveMode
    );

    try {
      const data = [new ClipboardItem({ [blob.type]: blob })];
      await navigator.clipboard.write(data);
      showMessage('Image copied to clipboard!', { timeoutMs: 5000 });
    } catch (err) {
      showMessage('Failed to copy image to clipboard.', { type: 'alert', timeoutMs: 5000 });
    }
  });

  dom.downloadPngBtn.addEventListener('click', async () => {
    // include in-progress stroke if any
    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const dpi = currentDpiValue();
    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentStrokeWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      dom.penColorInput.value,
      currentStrokeWidth,
      dpi,
      logicalWidth,
      logicalHeight,
      currentCurveMode
    );

    await downloadFile(blob, `signature-${Date.now()}.png`);
  });

  dom.downloadSvgBtn.addEventListener('click', async () => {
    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentStrokeWidth
    );

    const svgContent = generateSvg(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      dom.penColorInput.value,
      currentStrokeWidth,
      currentCurveMode
    );

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    await downloadFile(blob, `signature-${Date.now()}.svg`);
  });

  dom.exportSignaturesBtn.addEventListener('click', async () => {
    try {
      const all = await getAllSignatures();
      if (!all || all.length === 0) {
        showMessage('No saved signatures to export.', { type: 'warning', timeoutMs: 4000 });
        return;
      }
      const payload = JSON.stringify(all, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      await downloadFile(blob, `signatures-export-${Date.now()}.json`);
      showMessage('Signatures exported.', { timeoutMs: 3000 });
    } catch (e) {
      console.error('Export failed', e);
      showMessage('Failed to export signatures.', { type: 'alert', timeoutMs: 5000 });
    }
  });

  dom.importSignaturesBtn.addEventListener('click', () => {
    dom.importFileInput.value = '';
    dom.importFileInput.click();
  });

  dom.importFileInput.addEventListener('change', async (ev) => {
    const input = ev.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        showMessage('Invalid file format. Expected an array of signatures.', {
          type: 'alert',
          timeoutMs: 6000,
        });
        return;
      }

      // Validate & import entries
      let imported = 0;
      for (const item of parsed) {
        try {
          const obj = item as Partial<SignatureData>;
          if (!obj.rawPaths || !obj.timestamp) continue; // minimal validation

          const sig: SignatureData = {
            id: obj.id || crypto.randomUUID(),
            image: obj.image || '',
            width: obj.width || 0,
            height: obj.height || 0,
            timestamp: obj.timestamp || Date.now(),
            color: obj.color || dom.penColorInput.value,
            strokeWidth: obj.strokeWidth || currentStrokeWidth,
            rawPaths: (obj.rawPaths as Point[][]) || [],
          };

          await putSignature(sig);
          imported++;
        } catch (inner) {
          console.warn('Skipping invalid signature entry', inner);
        }
      }

      if (imported > 0) {
        showMessage(`Imported ${imported} signatures.`, { timeoutMs: 4000 });
        void renderSignatures();
      } else {
        showMessage('No valid signatures found in file.', { type: 'warning', timeoutMs: 5000 });
      }
    } catch (e) {
      console.error('Import failed', e);
      showMessage('Failed to import signatures. Is this a valid JSON export?', {
        type: 'alert',
        timeoutMs: 6000,
      });
    } finally {
      dom.importFileInput.value = '';
    }
  });

  // --- Signature Rendering ---

  async function renderSignatures() {
    const saved: SignatureData[] = await getAllSignatures();
    dom.signaturesList.innerHTML = '';

    if (saved.length > 0) {
      dom.savedContainer.classList.remove('hidden');
    } else {
      dom.savedContainer.classList.add('hidden');
    }

    saved.forEach((sig) => {
      const clone = dom.template.content.cloneNode(true) as HTMLElement;
      (clone.querySelector('.signature-preview') as HTMLImageElement).src = sig.image;
      (clone.querySelector('.signature-date') as HTMLElement).textContent = new Date(
        sig.timestamp
      ).toLocaleString();

      clone.querySelector('.delete-signature-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this signature?')) {
          await deleteSignature(sig.id);
          void renderSignatures();
        }
      });

      clone.querySelector('.load-signature-btn')?.addEventListener('click', async () => {
        // Clear current paths and memCanvas
        paths = [];
        memCtx.clearRect(0, 0, userWidth(), userHeight());
        prevLiveWidth = sig.strokeWidth;

        // Compute scale to fit signature into the canvas while preserving aspect
        const canvasW = userWidth();
        const canvasH = userHeight();
        const sigW = sig.width;
        const sigH = sig.height;
        const scale = Math.min(canvasW / sigW, canvasH / sigH, 1);

        // Centering offsets
        const offsetX = (canvasW - sigW * scale) / 2;
        const offsetY = (canvasH - sigH * scale) / 2;

        // Draw each path scaled and translated onto memCtx
        memCtx.save();
        memCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // ensure memCtx in user units
        memCtx.translate(offsetX, offsetY);
        memCtx.scale(scale, scale);

        sig.rawPaths.forEach((p) => {
          drawSignaturePath(memCtx, p, sig.color, sig.strokeWidth, currentCurveMode);
        });

        memCtx.restore();
        paths = sig.rawPaths.map((path) =>
          path.map((pt) => ({
            x: pt.x * scale + offsetX,
            y: pt.y * scale + offsetY,
            timestamp: pt.timestamp,
            pressure: pt.pressure,
          }))
        );

        drawStatic();
      });

      clone.querySelector('.download-svg-btn')?.addEventListener('click', async () => {
        const svgContent = generateSvg(
          sig.rawPaths,
          sig.width,
          sig.height,
          sig.color,
          sig.strokeWidth,
          currentCurveMode
        );
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        await downloadFile(blob, `signature-${sig.timestamp}.svg`);
      });

      clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
        const dpi = currentDpiValue();
        generatePng(
          sig.rawPaths,
          sig.color,
          sig.strokeWidth,
          dpi,
          sig.width,
          sig.height,
          currentCurveMode
        ).then(({ blob }) => {
          downloadFile(blob, `signature-${sig.timestamp}.png`);
          console.log('PNG downloaded', sig);
        });
      });

      dom.signaturesList.appendChild(clone);
    });
  }

  void renderSignatures();

  return () => {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('pointerup', stopDrawing);
  };
}

// noinspection JSUnusedGlobalSymbols
export const savedSignatures = async (): Promise<SignatureData[]> => {
  return getAllSignatures();
};
