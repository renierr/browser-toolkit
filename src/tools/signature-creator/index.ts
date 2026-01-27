import { downloadFile } from '../../js/file-utils.ts';

interface Point {
  x: number;
  y: number;
}

interface SignatureData {
  id: string;
  image: string; // Base64 PNG (High Res)
  width: number; // Logical width (1x scale)
  height: number; // Logical height (1x scale)
  timestamp: number;
  color: string;
  strokeWidth: number;
  rawPaths: Point[][]; // Normalized paths (relative to 0,0)
}

// --- Configuration ---
const MOVE_TOLERANCE = 2; // Ignore mouse moves smaller than 2px
const SIMPLIFY_TOLERANCE = 0.6; // RDP Tolerance: Higher = fewer points, jagged curves
const MIN_WIDTH_FACTOR = 0.35; // Thin lines are 35% of max width

// --- IndexedDB Helper (lightweight) ---
const DB_NAME = 'bt-signatures-db';
const DB_STORE = 'signatures';
const DB_VERSION = 1;

// Legacy localStorage key (used by older versions)
const LEGACY_STORAGE_KEY = 'bt-signatures';

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

// One-time migration: move legacy localStorage entries into IndexedDB
async function migrateFromLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Not JSON -> skip
      return;
    }

    // Support both array of signatures or single object { id: ..., ... }
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of arr) {
      try {
        // Normalize incoming shape to SignatureData
        const sig: SignatureData = {
          id: item.id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          image: item.image || item.dataUrl || '',
          width: Number(item.width) || Number(item.logicalWidth) || 0,
          height: Number(item.height) || Number(item.logicalHeight) || 0,
          timestamp: Number(item.timestamp) || Number(item.time) || Date.now(),
          color: item.color || '#000000',
          strokeWidth: Number(item.strokeWidth) || Number(item.widthPx) || 2,
          rawPaths: item.rawPaths || item.paths || [],
        };

        // Skip invalid records (no image)
        if (!sig.image) continue;

        await putSignature(sig);
      } catch (err) {
        // Ignore bad items and continue
        // eslint-disable-next-line no-console
        console.warn('signature migration: skipped item', err);
      }
    }

    // Remove legacy key after successful migration
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('signature migration failed', err);
  }
}

async function getAllSignatures(): Promise<SignatureData[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      // Return in reverse chronological order (most recent first)
      const res = (req.result as SignatureData[] || []).sort((a, b) => b.timestamp - a.timestamp);
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

// 1. Ramer-Douglas-Peucker Simplification (Reduces point count)
function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  let maxSqDist = 0;
  let index = 0;
  const last = points.length - 1;

  for (let i = 1; i < last; i++) {
    const p = points[i];
    const p1 = points[0];
    const p2 = points[last];
    let sqDist = 0;

    // Distance from point to line segment
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);
      if (t > 1) sqDist = (p.x - p2.x) ** 2 + (p.y - p2.y) ** 2;
      else if (t > 0)
        sqDist = (p.x - (p1.x + dx * t)) ** 2 + (p.y - (p1.y + dy * t)) ** 2;
      else sqDist = (p.x - p1.x) ** 2 + (p.y - p1.y) ** 2;
    } else {
      sqDist = (p.x - p1.x) ** 2 + (p.y - p1.y) ** 2;
    }

    if (sqDist > maxSqDist) {
      maxSqDist = sqDist;
      index = i;
    }
  }

  if (maxSqDist > sqTolerance) {
    const left = simplifyPath(points.slice(0, index + 1), tolerance);
    const right = simplifyPath(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

// 2. Velocity-based Width Calculation
const mapDistToWidth = (dist: number, baseWidth: number) => {
  return Math.max(baseWidth * MIN_WIDTH_FACTOR, baseWidth - dist / 4);
};

// 3. Catmull-Rom to Cubic Bezier Control Points
const getCatmullRomControlPoints = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
) => {
  return {
    c1x: p1.x + (p2.x - p0.x) / 6,
    c1y: p1.y + (p2.y - p0.y) / 6,
    c2x: p2.x - (p3.x - p1.x) / 6,
    c2y: p2.y - (p3.y - p1.y) / 6,
  };
};

// --- Helper: Rendering ---

type CurveMode = "fast" | "natural";

function drawSignaturePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number,
  mode: CurveMode,
) {
  if (!points || points.length === 0) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
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
  if (mode === "fast") {
    // Fast: Quadratic Curve (Midpoint approximation) - Good for live drawing
    let p1 = points[0];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      ctx.lineWidth = mapDistToWidth(dist, baseWidth);

      // Note: We break the path to change lineWidth, so connections aren't perfect
      // but it is fast enough for the "Draft" layer.
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);

      p1 = p2;
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else {
    // Natural: Cubic Bezier (Catmull-Rom) - Good for final bake/export
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

      ctx.lineWidth = mapDistToWidth(dist, baseWidth);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
      ctx.stroke();
    }
  }
}

// --- Helper: High Res Export ---

function generateHighResPng(
  paths: Point[][],
  color: string,
  baseWidth: number,
  targetDpi: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    // 1. Calculate Bounding Box
    const flat = paths.flat();
    const minX = Math.min(...flat.map((p) => p.x));
    const minY = Math.min(...flat.map((p) => p.y));
    const maxX = Math.max(...flat.map((p) => p.x));
    const maxY = Math.max(...flat.map((p) => p.y));

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = baseWidth * 2;

    // 2. Scale Factor (72 DPI is base)
    const scaleFactor = targetDpi / 72;

    // 3. Setup Canvas
    const logicalW = contentW + padding * 2;
    const logicalH = contentH + padding * 2;
    const exportW = Math.ceil(logicalW * scaleFactor);
    const exportH = Math.ceil(logicalH * scaleFactor);

    const canvas = document.createElement("canvas");
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext("2d")!;

    // 4. Draw Scaled & Translated
    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(-minX + padding, -minY + padding);

    paths.forEach((path) => {
      drawSignaturePath(ctx, path, color, baseWidth, "natural");
    });

    canvas.toBlob((blob) => {
      if (blob) resolve({ blob, width: exportW, height: exportH });
    }, "image/png");
  });
}

// --- Helper: Optimized SVG ---

function generateSmoothSvg(
  paths: Point[][],
  width: number,
  height: number,
  color: string,
  baseWidth: number,
): string {
  const f = (n: number) => n.toFixed(2);
  let content = "";

  paths.forEach((path) => {
    if (path.length < 1) return;

    if (path.length === 1) {
      content += `<circle cx="${f(path[0].x)}" cy="${f(path[0].y)}" r="${f(baseWidth / 2)}" fill="${color}" />`;
      return;
    }

    // Draw using Cubic Beziers for max compression and smoothness
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
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

export const savedSignatures = async (): Promise<SignatureData[]> => {
  return getAllSignatures();
};

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
  const container = document.getElementById('canvas-container');
  const clearBtn = document.getElementById('clear-btn');
  const saveBtn = document.getElementById('save-btn');
  const colorInput = document.getElementById('stroke-color') as HTMLInputElement;
  const widthInput = document.getElementById('stroke-width') as HTMLInputElement;
  const fastCurve = document.getElementById('fast-curve') as HTMLInputElement;
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
    !signaturesList ||
    !savedContainer ||
    !template ||
    !colorInput ||
    !widthInput ||
    !widthValue ||
    !fastCurve ||
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
  let useFastCurve = fastCurve.checked;

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

    // 1. Simplify (Optimization)
    // Reduces point count by x% before baking/storing
    const simplified = simplifyPath(currentPath, SIMPLIFY_TOLERANCE);

    // 2. Bake High-Quality Curve (Correction)
    drawSignaturePath(
      memCtx,
      simplified,
      colorInput.value,
      currentStrokeWidth,
      useFastCurve ? 'fast' : 'natural'
    );

    paths.push(simplified);
    currentPath = [];

    // 3. Refresh View
    // Wipes the "Draft" layer and shows the "Baked" layer
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
  fastCurve.addEventListener('input', () => {
    useFastCurve = fastCurve.checked;
  });

  // --- Controls ---

  clearBtn.addEventListener('click', () => {
    paths = [];
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    ctx.clearRect(0, 0, userWidth(), userHeight());
  });

  saveBtn.addEventListener('click', async () => {
    if (paths.length === 0) return;

    const dpi = dpiInput && dpiInput.value ? parseInt(dpiInput.value) : 72;

    // 1. Calculate Bounds & Normalize
    const flat = paths.flat();
    const minX = Math.min(...flat.map((p) => p.x));
    const minY = Math.min(...flat.map((p) => p.y));
    const maxX = Math.max(...flat.map((p) => p.x));
    const maxY = Math.max(...flat.map((p) => p.y));

    const padding = currentStrokeWidth * 2;
    const logicalWidth = maxX - minX + padding * 2;
    const logicalHeight = maxY - minY + padding * 2;

    // Shift paths to start at (0,0) for storage portability
    const normalizedPaths = paths.map((path) =>
      path.map((p) => ({ x: p.x - minX + padding, y: p.y - minY + padding }))
    );

    // 2. Generate High-Res Image
    const { blob } = await generateHighResPng(
      normalizedPaths,
      colorInput.value,
      currentStrokeWidth,
      dpi
    );

    // 3. Save
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

  // --- Signature Rendering ---

  function createFullSvg(sig: SignatureData): string {
    return generateSmoothSvg(sig.rawPaths, sig.width, sig.height, sig.color, sig.strokeWidth);
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

      clone.querySelector('.download-svg-btn')?.addEventListener('click', async () => {
        const svgContent = createFullSvg(sig);
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        await downloadFile(blob, `signature-${sig.timestamp}.svg`);
      });

      clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `signature-${sig.timestamp}.png`;
        link.href = sig.image;
        link.click();
      });

      signaturesList!.appendChild(clone);
    });
  }

  // Run migration from localStorage (if any) before rendering
  migrateFromLocalStorage().then(() => {
    void renderSignatures();
  }).catch(() => {
    // If migration fails, still attempt to render existing signatures
    void renderSignatures();
  });

  return () => {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('mouseup', stopDrawing);
    window.removeEventListener('touchend', stopDrawing);
  };
}

