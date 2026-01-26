import { downloadFile } from '../../js/file-utils.ts';

interface Point {
  x: number;
  y: number;
}

interface SignatureData {
  id: string;
  image: string; // Base64 PNG
  width: number;
  height: number;
  timestamp: number;
  color: string;
  strokeWidth: number;
  rawPaths: Point[][];
}

const STORAGE_KEY = 'bt-signatures';

export const savedSignatures = () => {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as SignatureData[];
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
    !widthValue
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

  // Set initial width value
  widthValue.textContent = widthInput.value;

  function debouncedRedraw() {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    redrawTimeout = window.setTimeout(() => {
      drawStatic();
      redrawTimeout = null;
    }, 50);
  }

  function drawStatic() {
    // Clear visible canvas in user units, then draw the baked memCanvas scaled to user units.
    ctx!.clearRect(0, 0, userWidth(), userHeight());
    ctx!.drawImage(memCanvas, 0, 0, userWidth(), userHeight());
  }

  function drawFastCurve(
    targetCtx: CanvasRenderingContext2D,
    p: Point[],
    color: string,
    baseWidth: number,
    finalize: boolean = false
  ) {
    if (p.length < 3) return;

    targetCtx.beginPath();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.strokeStyle = color;

    targetCtx.moveTo(p[0].x, p[0].y);

    for (let i = 1; i < p.length - 2; i++) {
      const xc = (p[i].x + p[i + 1].x) / 2;
      const yc = (p[i].y + p[i + 1].y) / 2;

      // Dynamic width logic integrated into the curve
      const dist = Math.sqrt(Math.pow(p[i].x - p[i - 1].x, 2) + Math.pow(p[i].y - p[i - 1].y, 2));
      targetCtx.lineWidth = mapDistToWidth(dist, baseWidth);

      targetCtx.quadraticCurveTo(p[i].x, p[i].y, xc, yc);
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.moveTo(xc, yc);
    }

    if (finalize) {
      targetCtx.quadraticCurveTo(
        p[p.length - 2].x,
        p[p.length - 2].y,
        p[p.length - 1].x,
        p[p.length - 1].y
      );
      targetCtx.stroke();
    }
  }

  function drawNaturalCurve(
    targetCtx: CanvasRenderingContext2D,
    path: Point[],
    color: string,
    baseWidth: number
  ) {
    if (!path || path.length === 0) return;

    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.strokeStyle = color;
    targetCtx.fillStyle = color;

    // Single point -> draw a dot
    if (path.length === 1) {
      const p = path[0];
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, baseWidth / 2, 0, Math.PI * 2);
      targetCtx.fill();
      return;
    }

    // Two points -> simple line
    if (path.length === 2) {
      const p0 = path[0];
      const p1 = path[1];
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      targetCtx.lineWidth = mapDistToWidth(dist, baseWidth);
      targetCtx.beginPath();
      targetCtx.moveTo(p0.x, p0.y);
      targetCtx.lineTo(p1.x, p1.y);
      targetCtx.stroke();
      return;
    }

    // More than two points -> Catmull-Rom -> cubic Bezier smoothing
    const pts = path.map((p) => ({ x: p.x, y: p.y }));
    const n = pts.length;

    // Helper to safely access points with clamped indices
    const getP = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];

    // Draw each segment separately so we can vary lineWidth per segment
    for (let i = 0; i < n - 1; i++) {
      const P0 = getP(i - 1);
      const P1 = getP(i);
      const P2 = getP(i + 1);
      const P3 = getP(i + 2);

      // Catmull-Rom to Bezier control points
      const c1x = P1.x + (P2.x - P0.x) / 6;
      const c1y = P1.y + (P2.y - P0.y) / 6;
      const c2x = P2.x - (P3.x - P1.x) / 6;
      const c2y = P2.y - (P3.y - P1.y) / 6;

      const dist = Math.hypot(P2.x - P1.x, P2.y - P1.y);
      targetCtx.lineWidth = mapDistToWidth(dist, baseWidth);

      targetCtx.beginPath();
      targetCtx.moveTo(P1.x, P1.y);
      targetCtx.bezierCurveTo(c1x, c1y, c2x, c2y, P2.x, P2.y);
      targetCtx.stroke();
    }
  }

  // Set internal canvas resolution to match display size
  const syncCanvasSize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = memCanvas.width = rect.width * dpr;
      canvas.height = memCanvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      memCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStatic();
    }
  };

  function getPos(e: MouseEvent | TouchEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startDrawing(e: MouseEvent | TouchEvent) {
    isDrawing = true;
    currentPath = [getPos(e)];
    e.preventDefault();
  }

  const MOVE_TOLERANCE = 2;

  function draw(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;

    const pos = getPos(e);
    const last = currentPath.length ? currentPath[currentPath.length - 1] : undefined;

    if (last) {
      // Tolerance in user pixels to reduce noisy points
      const dx = pos.x - last.x;
      const dy = pos.y - last.y;

      // Use squared distance for the cheap threshold check to avoid a sqrt
      const distSq = dx * dx + dy * dy;
      if (distSq < MOVE_TOLERANCE * MOVE_TOLERANCE) {
        e.preventDefault();
        return;
      }
    }

    currentPath.push(pos);
    if (useFastCurve) {
      drawFastCurve(ctx!, currentPath, colorInput.value, currentStrokeWidth);
    } else {
      drawNaturalCurve(ctx!, currentPath, colorInput.value, currentStrokeWidth);
    }
    e.preventDefault();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    // Bake the active stroke into the persistent memory canvas
    if (useFastCurve) {
      drawFastCurve(memCtx, currentPath, colorInput.value, currentStrokeWidth, true);
    } else {
      drawNaturalCurve(memCtx, currentPath, colorInput.value, currentStrokeWidth);
    }
    paths.push([...currentPath]);
    currentPath = [];
    drawStatic();
  }

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
  fastCurve.addEventListener('input', () => { useFastCurve = fastCurve.checked });

  clearBtn.addEventListener('click', () => {
    paths = [];
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    ctx.clearRect(0, 0, userWidth(), userHeight());
    drawStatic();
  });

  saveBtn.addEventListener('click', () => {
    if (paths.length === 0) return;

    const color = colorInput.value;

    // 1. Calculate Bounding Box for Auto-Crop
    const flat = paths.flat();
    const minX = Math.min(...flat.map((p) => p.x));
    const minY = Math.min(...flat.map((p) => p.y));
    const maxX = Math.max(...flat.map((p) => p.x));
    const maxY = Math.max(...flat.map((p) => p.y));

    const baseWidth = currentStrokeWidth;
    const padding = baseWidth + 5;
    const cropW = maxX - minX + padding * 2;
    const cropH = maxY - minY + padding * 2;

    // crop paths to shift to cropped coords
    const croppedPaths: Point[][] = [];
    paths.forEach((path) => {
      const shifted = path.map((p) => ({ ...p, x: p.x - minX + padding, y: p.y - minY + padding }));
      croppedPaths.push(shifted);
    });

    // 2. Generate PNG
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tCtx = tempCanvas.getContext('2d')!;

    croppedPaths.forEach((path) => {
      drawNaturalCurve(tCtx, path, colorInput.value, baseWidth);
    });

    const signature: SignatureData = {
      id: crypto.randomUUID(),
      image: tempCanvas.toDataURL('image/png'),
      width: cropW,
      height: cropH,
      timestamp: Date.now(),
      color: color,
      strokeWidth: baseWidth,
      rawPaths: croppedPaths,
    };

    const saved = savedSignatures();
    saved.unshift(signature);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    paths = [];
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    ctx.clearRect(0, 0, userWidth(), userHeight());
    drawStatic();
    renderSignatures();
  });

  function createFullSvg(sig: SignatureData): string {
    return generateSmoothSvg(sig.rawPaths, sig.width, sig.height, sig.color, sig.strokeWidth);
  }

  function renderSignatures() {
    const saved: SignatureData[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
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

      clone.querySelector('.delete-signature-btn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this signature?')) {
          const updated = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(
            (s: SignatureData) => s.id !== sig.id
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          renderSignatures();
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

  renderSignatures();

  return () => {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('mouseup', stopDrawing);
    window.removeEventListener('touchend', stopDrawing);
  };
}

function generateSmoothSvg(
  paths: Point[][],
  width: number,
  height: number,
  color: string,
  baseWidth: number
): string {
  let svgPaths = '';

  const getX = (x: number) => x.toFixed(2);
  const getY = (y: number) => y.toFixed(2);

  // Evaluate cubic Bezier at t in [0,1] for points P1 (start), C1, C2, P2 (end)
  const cubicPoint = (
    t: number,
    P1: { x: number; y: number },
    C1: { x: number; y: number },
    C2: { x: number; y: number },
    P2: { x: number; y: number }
  ) => {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    const x = uuu * P1.x + 3 * uu * t * C1.x + 3 * u * tt * C2.x + ttt * P2.x;
    const y = uuu * P1.y + 3 * uu * t * C1.y + 3 * u * tt * C2.y + ttt * P2.y;

    return { x, y };
  };

  paths.forEach((path) => {
    if (!path || path.length === 0) return;

    if (path.length === 1) {
      const p = path[0];
      // single dot; velocity unknown -> 0
      svgPaths += `<circle cx="${getX(p.x)}" cy="${getY(p.y)}" r="${(baseWidth / 2).toFixed(2)}" fill="${color}" />`;
      return;
    }

    if (path.length === 2) {
      const p0 = path[0];
      const p1 = path[1];
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const sw = mapDistToWidth(dist, baseWidth).toFixed(2);
      const d = `M ${getX(p0.x)} ${getY(p0.y)} L ${getX(p1.x)} ${getY(p1.y)}`;
      svgPaths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" />`;
      return;
    }

    // n >= 3 -> Catmull-Rom -> cubic Bezier segments approximated by small straight segments
    const n = path.length;
    const pts = path.map((p) => ({ x: p.x, y: p.y }));
    const getP = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];

    // Subdivision steps per cubic segment (higher = smoother, more paths)
    const STEPS = 8;

    for (let i = 0; i < n - 1; i++) {
      const P0 = getP(i - 1);
      const P1 = getP(i);
      const P2 = getP(i + 1);
      const P3 = getP(i + 2);

      // Catmull-Rom -> cubic Bezier control points
      const c1x = P1.x + (P2.x - P0.x) / 6;
      const c1y = P1.y + (P2.y - P0.y) / 6;
      const c2x = P2.x - (P3.x - P1.x) / 6;
      const c2y = P2.y - (P3.y - P1.y) / 6;

      // velocity between P1 and P2 -> used for all subsegments of this cubic (matches canvas behavior)
      const segDist = Math.hypot(P2.x - P1.x, P2.y - P1.y);
      const segStroke = mapDistToWidth(segDist, baseWidth);

      // Subdivide cubic into STEPS straight segments, emit a small path per segment with its stroke-width and velocity
      let prev = cubicPoint(0, P1, { x: c1x, y: c1y }, { x: c2x, y: c2y }, P2);
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const curr = cubicPoint(t, P1, { x: c1x, y: c1y }, { x: c2x, y: c2y }, P2);
        const d = `M ${getX(prev.x)} ${getY(prev.y)} L ${getX(curr.x)} ${getY(curr.y)}`;
        svgPaths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${segStroke.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" />`;
        prev = curr;
      }
    }
  });

  // Include base stroke width as a data attribute on the root SVG
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-stroke-width="${baseWidth}" xmlns="http://www.w3.org/2000/svg">${svgPaths}</svg>`;
}

const mapDistToWidth = (dist: number, baseWidth: number) => {
  const minFactor = 0.35;
  return Math.max(baseWidth * minFactor, baseWidth - dist / 4);
};
