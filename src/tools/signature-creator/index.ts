import { downloadFile } from '../../js/file-utils.ts';
import { showMessage } from '../../js/ui.ts';
import { applySettings, loadSettings, resetToDefaults, saveSettings, } from './settings.ts';
import { getDomElements } from './dom.ts';
import type { CurveMode, Point, RDPMode, SignatureData, SignatureSettings } from './signature-types.ts';
import {
  buildNormalizedFromPaths,
  computeSegmentWidth,
  computeWidthFromVelocityAndPressure,
  getCatmullRomControlPoints,
  simplifyRDP,
} from './calculation.ts';

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

// --- Helper: Rendering ---

function drawSignaturePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  settings: SignatureSettings
) {
  if (!points || points.length === 0) return;

  const mode = settings.curveMode || 'natural';
  const baseWidth = settings.penWidth || 2;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = settings.penColor;
  ctx.fillStyle = settings.penColor;

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

      const rawW = computeSegmentWidth(p1, p2, settings);
      const w = prevWidth * settings.widthSmoothing + rawW * (1 - settings.widthSmoothing);

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

      const rawWidth = computeWidthFromVelocityAndPressure(avgVel, avgPress, settings);
      const w = prevWidth * settings.widthSmoothing + rawWidth * (1 - settings.widthSmoothing);
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
      const rawW = computeSegmentWidth(p1, p2, settings);
      const w = prevWidth * settings.widthSmoothing + rawW * (1 - settings.widthSmoothing);
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
  logicalWidth: number,
  logicalHeight: number,
  settings: SignatureSettings
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    // Scale Factor (72 DPI is base)
    const scaleFactor = settings.dpi / 72;

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
      drawSignaturePath(ctx, path, settings);
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
  settings: SignatureSettings
): string {
  const f = (n: number) => {
    const s = n.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  let content = '';

  paths.forEach((path) => {
    if (!path || path.length === 0) return;
    const mode = settings.curveMode || 'natural';
    const baseWidth = settings.penWidth || 2;

    if (path.length === 1) {
      content += `<circle cx="${f(path[0].x)}" cy="${f(path[0].y)}" r="${f(baseWidth / 2)}" fill="${settings.penColor}" />\n`;
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
        const rawW = computeSegmentWidth(p1, p2, settings);
        const w = prevWidth * settings.widthSmoothing + rawW * (1 - settings.widthSmoothing);
        prevWidth = w;

        const d = `M${f(p1.x)} ${f(p1.y)} C${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
        content += `<path d="${d}" stroke-width="${f(w)}" />\n`;
      }
    }
  });

  return `<svg width="${f(width)}" height="${f(height)}" viewBox="0 0 ${f(width)} ${f(height)}" xmlns="http://www.w3.org/2000/svg"><g stroke="${settings.penColor}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n${content}</g></svg>`;
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const dom = getDomElements(document);

  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;

  // Performance Buffer: Stores "dried" ink to keep the UI snappy
  const memCanvas = document.createElement('canvas');
  const memCtx = memCanvas.getContext('2d')!;

  let isDrawing = false;
  let paths: Point[][] = [];
  let currentPath: Point[] = [];

  let redrawTimeout: number | null = null;
  let currentSettings: SignatureSettings = loadSettings();
  let prevLiveWidth = currentSettings.penWidth;

  const dpr = window.devicePixelRatio || 1;
  const userWidth = () => dom.canvas.width / dpr;
  const userHeight = () => dom.canvas.height / dpr;

  // Set initial display values
  applySettings(currentSettings);

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
        drawSignaturePath(memCtx, p, currentSettings);
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
    prevLiveWidth = currentSettings.penWidth;

    dom.canvas.setPointerCapture(e.pointerId);
  }

  function draw(e: PointerEvent) {
    if (!isDrawing) return;
    const pos = getPos(e);
    const prev = currentPath[currentPath.length - 1];

    // Cheap threshold check
    if (prev) {
      const distSq = (pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2;
      if (distSq < currentSettings.moveTolerance * currentSettings.moveTolerance) return;
    }

    currentPath.push(pos);

    // DRAFT MODE: Additive drawing only
    // We only draw the new segment on top of the existing canvas.
    if (currentPath.length > 1) {
      const p0 = currentPath[currentPath.length - 2];
      const p1 = currentPath[currentPath.length - 1];
      ctx!.beginPath();
      const rawSegmentW = computeSegmentWidth(p0, p1, currentSettings);
      const liveW =
        prevLiveWidth * currentSettings.widthSmoothing + rawSegmentW * (1 - currentSettings.widthSmoothing);
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

    const currentRDPMode: RDPMode = currentSettings.rdpMode || 'none';
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
      currentSettings
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
    currentSettings.penColor = dom.penColorInput.value;
    debouncedRedraw();
    saveSettings(currentSettings);
  });

  dom.penWidthInput.addEventListener('input', () => {
    currentSettings.penWidth = parseInt(dom.penWidthInput.value);
    dom.penWidthValue.textContent = dom.penWidthInput.value;
    debouncedRedraw();
    saveSettings(currentSettings);
  });

  dom.curveModeSelect.addEventListener('change', () => {
    currentSettings.curveMode = dom.curveModeSelect.value as CurveMode;
    debouncedRedraw();
    saveSettings(currentSettings);
  });

  dom.rdpModeSelect.addEventListener('change', () => {
    currentSettings.rdpMode = dom.rdpModeSelect.value as RDPMode;
    saveSettings(currentSettings);
  });

  dom.dpiInput.addEventListener('change', () => {
    currentSettings.dpi = parseInt(dom.dpiInput.value);
    saveSettings(currentSettings)
  });

  // Advanced controls
  const moveToleranceInput = dom.moveToleranceInput;
  const moveToleranceValue = dom.moveToleranceValue;
  const minWidthFactorInput = dom.minWidthFactorInput;
  const minWidthFactorValue = dom.minWidthFactorValue;
  const maxWidthFactorInput = dom.maxWidthFactorInput;
  const maxWidthFactorValue = dom.maxWidthFactorValue;
  const velocitySensitivityInput = dom.velocitySensitivityInput;
  const velocitySensitivityValue = dom.velocitySensitivityValue;
  const pressureInfluenceInput = dom.pressureInfluenceInput;
  const pressureInfluenceValue = dom.pressureInfluenceValue;
  const velocityInfluenceInput = dom.velocityInfluenceInput;
  const velocityInfluenceValue = dom.velocityInfluenceValue;
  const widthSmoothingInput = dom.widthSmoothingInput;
  const widthSmoothingValue = dom.widthSmoothingValue;

  if (moveToleranceInput && moveToleranceValue) {
    moveToleranceInput.value = String(currentSettings.moveTolerance);
    moveToleranceValue.textContent = String(currentSettings.moveTolerance);
  }
  if (minWidthFactorInput && minWidthFactorValue) {
    minWidthFactorInput.value = String(currentSettings.minWidthFactor);
    minWidthFactorValue.textContent = String(currentSettings.minWidthFactor);
  }
  if (maxWidthFactorInput && maxWidthFactorValue) {
    maxWidthFactorInput.value = String(currentSettings.maxWidthFactor);
    maxWidthFactorValue.textContent = String(currentSettings.maxWidthFactor);
  }
  if (velocitySensitivityInput && velocitySensitivityValue) {
    velocitySensitivityInput.value = String(currentSettings.velocitySensitivity);
    velocitySensitivityValue.textContent = String(currentSettings.velocitySensitivity);
  }
  if (pressureInfluenceInput && pressureInfluenceValue) {
    pressureInfluenceInput.value = String(currentSettings.pressureInfluence);
    pressureInfluenceValue.textContent = String(currentSettings.pressureInfluence);
  }
  if (velocityInfluenceInput && velocityInfluenceValue) {
    velocityInfluenceInput.value = String(currentSettings.velocityInfluence);
    velocityInfluenceValue.textContent = String(currentSettings.velocityInfluence);
  }
  if (widthSmoothingInput && widthSmoothingValue) {
    widthSmoothingInput.value = String(currentSettings.widthSmoothing);
    widthSmoothingValue.textContent = String(currentSettings.widthSmoothing);
  }

  // Listeners to update runtime config
  moveToleranceInput?.addEventListener('input', () => {
    currentSettings.moveTolerance = parseInt(moveToleranceInput.value);
    moveToleranceValue && (moveToleranceValue.textContent = moveToleranceInput.value);
    saveSettings(currentSettings);
  });
  minWidthFactorInput?.addEventListener('input', () => {
    currentSettings.minWidthFactor = parseFloat(minWidthFactorInput.value);
    minWidthFactorValue && (minWidthFactorValue.textContent = minWidthFactorInput.value);
    debouncedRedraw();
    saveSettings(currentSettings);
  });
  maxWidthFactorInput?.addEventListener('input', () => {
    currentSettings.maxWidthFactor = parseFloat(maxWidthFactorInput.value);
    maxWidthFactorValue && (maxWidthFactorValue.textContent = maxWidthFactorInput.value);
    debouncedRedraw();
    saveSettings(currentSettings);
  });
  velocitySensitivityInput?.addEventListener('input', () => {
    currentSettings.velocitySensitivity = parseFloat(velocitySensitivityInput.value);
    velocitySensitivityValue &&
      (velocitySensitivityValue.textContent = velocitySensitivityInput.value);
    debouncedRedraw();
    saveSettings(currentSettings);
  });
  pressureInfluenceInput?.addEventListener('input', () => {
    currentSettings.pressureInfluence = parseFloat(pressureInfluenceInput.value);
    pressureInfluenceValue && (pressureInfluenceValue.textContent = pressureInfluenceInput.value);
    debouncedRedraw();
    saveSettings(currentSettings);
  });
  velocityInfluenceInput?.addEventListener('input', () => {
    currentSettings.velocityInfluence = parseFloat(velocityInfluenceInput.value);
    velocityInfluenceValue && (velocityInfluenceValue.textContent = velocityInfluenceInput.value);
    debouncedRedraw();
    saveSettings(currentSettings);
  });
  widthSmoothingInput?.addEventListener('input', () => {
    currentSettings.widthSmoothing = parseFloat(widthSmoothingInput.value);
    widthSmoothingValue && (widthSmoothingValue.textContent = widthSmoothingInput.value);
    debouncedRedraw();
    saveSettings(currentSettings);
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
    prevLiveWidth = currentSettings.penWidth;
  });

  dom.saveBtn.addEventListener('click', async () => {
    if (paths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      paths,
      currentSettings.penWidth
    );

    // Generate Preview Image
    const settings: SignatureSettings = { ...currentSettings, dpi: 72 };
    const { blob } = await generatePng(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      settings
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
        settings: currentSettings,
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

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentSettings.penWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      currentSettings
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

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentSettings.penWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      currentSettings
    );

    await downloadFile(blob, `signature-${Date.now()}.png`);
  });

  dom.downloadSvgBtn.addEventListener('click', async () => {
    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentSettings.penWidth
    );

    const svgContent = generateSvg(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      currentSettings
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
            settings: obj.settings || currentSettings,
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
      // correct missing values for signature settings use defaults
      if (!sig.rawPaths) {
        sig.rawPaths = [];
      }
      if (!sig.settings) {
        sig.settings = currentSettings;
      }
      if (!sig.timestamp) {
        sig.timestamp = Date.now();
      }
      if (!sig.width) {
        sig.width = userWidth();
      }
      if (!sig.height) {
        sig.height = userHeight();
      }
      if (!sig.id) {
        sig.id = crypto.randomUUID();
      }
      if (!sig.image) {
        sig.image = '';
      }
      sig.settings = { ...currentSettings, ...sig.settings };

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
        currentSettings = sig.settings || currentSettings;
        applySettings(currentSettings);
        paths = [];
        memCtx.clearRect(0, 0, userWidth(), userHeight());
        prevLiveWidth = sig.settings.penWidth;

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
          drawSignaturePath(memCtx, p, sig.settings || currentSettings);
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
          sig.settings || currentSettings
        );
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        await downloadFile(blob, `signature-${sig.timestamp}.svg`);
      });

      clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
        generatePng(sig.rawPaths, sig.width, sig.height, sig.settings || currentSettings).then(
          ({ blob }) => {
            downloadFile(blob, `signature-${sig.timestamp}.png`);
            console.log('PNG downloaded', sig);
          }
        );
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
