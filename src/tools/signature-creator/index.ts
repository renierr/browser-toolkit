import { downloadFile } from '../../js/file-utils.ts';

interface Point {
  x: number;
  y: number;
}

interface SignatureData {
  id: string;
  image: string; // Base64 PNG (preview)
  width: number; // Logical width (1x scale)
  height: number; // Logical height (1x scale)
  timestamp: number;
  color: string;
  strokeWidth: number;
  rawPaths: Point[][]; // Normalized paths (relative to 0,0)
}

// --- Configuration ---
const MOVE_TOLERANCE = 2; // Ignore mouse moves smaller than 2px
const MIN_WIDTH_FACTOR = 0.35; // Thin lines are 35% of max width

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

// Velocity-based Width Calculation
const mapDistToWidth = (dist: number, baseWidth: number) => {
  return Math.max(baseWidth * MIN_WIDTH_FACTOR, baseWidth - dist / 4);
};

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
  const normalizedPaths = paths.map((path) =>
    path.map((p) => ({ x: p.x - minX + padding, y: p.y - minY + padding }))
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

type CurveMode = 'fast' | 'natural' | 'draft' | 'none';
type RDPMode = 'none' | 'low' | 'medium' | 'high';

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

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      ctx.lineWidth = mapDistToWidth(dist, baseWidth);
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);

      p1 = p2;
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else if (mode === 'natural') {
    let recentDists: number[] = [];

    // Natural: Cubic Bezier (Catmull-Rom) - Good for final bake/export
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      recentDists.push(dist);
      if (recentDists.length > 5) recentDists.shift(); // max 5 Segmente merken
      const avgDist = recentDists.reduce((a, b) => a + b, 0) / recentDists.length;

      ctx.lineWidth = mapDistToWidth(avgDist, baseWidth);
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
    //ctx.strokeStyle = colorInput.value;

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      ctx.lineWidth = mapDistToWidth(dist, baseWidth);
      ctx.moveTo(p1.x, p1.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineTo(p2.x, p2.y);
      p1 = p2;
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

function generateSmoothSvg(
  paths: Point[][],
  width: number,
  height: number,
  color: string,
  baseWidth: number,
  mode: CurveMode = 'natural'
): string {
  const f = (n: number) => n.toFixed(2);
  let content = '';

  paths.forEach((path) => {
    if (path.length < 1) return;

    if (path.length === 1) {
      content += `<circle cx="${f(path[0].x)}" cy="${f(path[0].y)}" r="${f(baseWidth / 2)}" fill="${color}" />`;
      return;
    }

    // Draw using Cubic Beziers for max compression and smoothness
    if (mode === 'none') {
      // Simple polyline/path for raw strokes
      let d = `M${f(path[0].x)} ${f(path[0].y)}`;
      for (let i = 1; i < path.length; i++) d += ` L${f(path[i].x)} ${f(path[i].y)}`;
      content += `<path d="${d}" stroke="${color}" stroke-width="${f(baseWidth)}" stroke-linecap="round" fill="none" />`;
    } else {
      for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];

        const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
        const w = mapDistToWidth(Math.hypot(p1.x - p2.x, p1.y - p2.y), baseWidth);

        const d = `M${f(p1.x)} ${f(p1.y)} C${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
        content += `<path d="${d}" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round" fill="none" />`;
      }
    }
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
  const container = document.getElementById('canvas-container');
  const clearBtn = document.getElementById('clear-btn');
  const saveBtn = document.getElementById('save-btn');
  const downloadPngBtn = document.getElementById('download-current-png-btn');
  const downloadSvgBtn = document.getElementById('download-current-svg-btn');
  const colorInput = document.getElementById('stroke-color') as HTMLInputElement;
  const widthInput = document.getElementById('stroke-width') as HTMLInputElement;
  const curveModeSelect = document.getElementById('curve-mode') as HTMLSelectElement;
  const rdpSelect = document.getElementById('rdp-epsilon') as HTMLSelectElement;
  const widthValue = document.getElementById('width-value');
  const dpiInput = document.getElementById('export-dpi') as HTMLInputElement;
  const signaturesList = document.getElementById('signatures-list');
  const savedContainer = document.getElementById('saved-signatures-container');
  const template = document.getElementById('signature-item-template') as HTMLTemplateElement;

  if (
    !canvas ||
    !container ||
    !clearBtn ||
    !saveBtn ||
    !downloadPngBtn ||
    !downloadSvgBtn ||
    !signaturesList ||
    !savedContainer ||
    !template ||
    !colorInput ||
    !widthInput ||
    !widthValue ||
    !curveModeSelect ||
    !rdpSelect ||
    !dpiInput
  )
    return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Performance Buffer: Stores "dried" ink to keep the UI snappy
  const memCanvas = document.createElement('canvas');
  const memCtx = memCanvas.getContext('2d')!;

  let isDrawing = false;
  let paths: Point[][] = [];
  let currentPath: Point[] = [];

  let redrawTimeout: number | null = null;
  let currentStrokeWidth = parseInt(widthInput.value);
  let currentCurveMode: CurveMode = (curveModeSelect.value as CurveMode) || 'natural';

  const dpr = window.devicePixelRatio || 1;
  const userWidth = () => canvas.width / dpr;
  const userHeight = () => canvas.height / dpr;

  // Set initial display values
  if (widthValue) widthValue.textContent = widthInput.value;
  if (!dpiInput.value) dpiInput.value = '72'; // Default

  // --- Sizing ---
  const syncCanvasSize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = memCanvas.width = rect.width * dpr;
      canvas.height = memCanvas.height = rect.height * dpr;

      // Normalize context to use CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      memCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawStatic();
    }
  };

  function debouncedRedraw() {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    redrawTimeout = window.setTimeout(() => {
      drawStatic();
      redrawTimeout = null;
    }, 50);
  }

  function getPos(e: MouseEvent | TouchEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function drawStatic() {
    // Clear visible canvas in user units, then draw the baked memCanvas scaled to user units.
    ctx!.clearRect(0, 0, userWidth(), userHeight());
    ctx!.drawImage(memCanvas, 0, 0, userWidth(), userHeight());
  }

  function startDrawing(e: MouseEvent | TouchEvent) {
    isDrawing = true;
    currentPath = [getPos(e)];
    e.preventDefault();
  }

  function draw(e: MouseEvent | TouchEvent) {
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
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

      ctx!.beginPath();
      ctx!.lineWidth = mapDistToWidth(dist, currentStrokeWidth);
      ctx!.lineCap = 'round';
      ctx!.strokeStyle = colorInput.value;
      ctx!.moveTo(p0.x, p0.y);
      ctx!.lineTo(p1.x, p1.y);
      ctx!.stroke();
    }
    e.preventDefault();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    const currentRDPMode: RDPMode = (rdpSelect.value as RDPMode) || 'none';
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
    drawSignaturePath(memCtx, simplified, colorInput.value, currentStrokeWidth, currentCurveMode);

    paths.push(simplified);
    currentPath = [];
    drawStatic();
  }

  // --- Listeners & Observers ---

  const resizeObserver = new ResizeObserver(() => syncCanvasSize());
  resizeObserver.observe(canvas);
  syncCanvasSize();

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stopDrawing);

  colorInput.addEventListener('input', debouncedRedraw);
  widthInput.addEventListener('input', () => {
    currentStrokeWidth = parseInt(widthInput.value);
    widthValue!.textContent = widthInput.value;
    debouncedRedraw();
  });
  curveModeSelect.addEventListener('change', () => {
    currentCurveMode = curveModeSelect.value as CurveMode;
    debouncedRedraw();
  });

  // --- Controls ---

  clearBtn.addEventListener('click', () => {
    paths = [];
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    ctx.clearRect(0, 0, userWidth(), userHeight());
  });

  saveBtn.addEventListener('click', async () => {
    if (paths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      paths,
      currentStrokeWidth
    );

    // Generate Preview Image
    const { blob } = await generatePng(
      normalizedPaths,
      colorInput.value,
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
        color: colorInput.value,
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

  downloadPngBtn.addEventListener('click', async () => {
    // include in-progress stroke if any
    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const dpi = dpiInput && dpiInput.value ? parseInt(dpiInput.value) : 72;
    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentStrokeWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      colorInput.value,
      currentStrokeWidth,
      dpi,
      logicalWidth,
      logicalHeight,
      currentCurveMode
    );

    await downloadFile(blob, `signature-${Date.now()}.png`);
  });

  downloadSvgBtn.addEventListener('click', async () => {
    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentStrokeWidth
    );

    const svgContent = generateSmoothSvg(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      colorInput.value,
      currentStrokeWidth,
      currentCurveMode
    );

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    await downloadFile(blob, `signature-${Date.now()}.svg`);
  });

  // --- Signature Rendering ---

  function createFullSvg(sig: SignatureData): string {
    return generateSmoothSvg(
      sig.rawPaths,
      sig.width,
      sig.height,
      sig.color,
      sig.strokeWidth,
      currentCurveMode
    );
  }

  async function renderSignatures() {
    const saved: SignatureData[] = await getAllSignatures();
    signaturesList!.innerHTML = '';

    if (saved.length > 0) {
      savedContainer!.classList.remove('hidden');
    } else {
      savedContainer!.classList.add('hidden');
    }

    saved.forEach((sig) => {
      const clone = template.content.cloneNode(true) as HTMLElement;
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
          path.map((pt) => ({ x: pt.x * scale + offsetX, y: pt.y * scale + offsetY }))
        );

        drawStatic();
      });

      clone.querySelector('.download-svg-btn')?.addEventListener('click', async () => {
        const svgContent = createFullSvg(sig);
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        await downloadFile(blob, `signature-${sig.timestamp}.svg`);
      });

      clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
        const dpi = dpiInput && dpiInput.value ? parseInt(dpiInput.value) : 72;
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

      signaturesList!.appendChild(clone);
    });
  }

  void renderSignatures();

  return () => {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('mouseup', stopDrawing);
    window.removeEventListener('touchend', stopDrawing);
  };
}

// noinspection JSUnusedGlobalSymbols
export const savedSignatures = async (): Promise<SignatureData[]> => {
  return getAllSignatures();
};
