import { downloadFile } from '../../js/file-utils.ts';

interface Point {
  x: number;
  y: number;
  t: number; // Timestamp for velocity calculation
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
  const dpr = window.devicePixelRatio || 1;

  // Set initial width value
  widthValue.textContent = widthInput.value;

  function redraw() {
    ctx!.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx!.drawImage(memCanvas, 0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  function debouncedRedraw() {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    redrawTimeout = window.setTimeout(() => {
      redraw();
      redrawTimeout = null;
    }, 50);
  }

  function drawNaturalCurve(
    targetCtx: CanvasRenderingContext2D,
    path: Point[],
    color: string,
    baseWidth: number
  ) {
    if (path.length < 3) return;

    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.strokeStyle = color;

    for (let i = 1; i < path.length - 2; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];

      // Calculate Midpoint for Quadratic Curve
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Velocity logic: Calculate distance and time between points
      const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const time = Math.max(1, p2.t - p1.t);
      const velocity = dist / time;

      // Natural Taper: Thinner when moving fast, limited to 30% of base weight
      targetCtx.lineWidth = Math.max(baseWidth * 0.3, baseWidth - velocity * 2.5);

      targetCtx.beginPath();
      targetCtx.moveTo(path[i - 1].x, path[i - 1].y); // Start at previous midpoint/start
      targetCtx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      targetCtx.stroke();

      // Update start point for next segment to be the current midpoint
      path[i].x = midX;
      path[i].y = midY;
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
      redraw();
    }
  };

  function getPos(e: MouseEvent | TouchEvent) : Point {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      t: Date.now(),
    };
  }

  function startDrawing(e: MouseEvent | TouchEvent) {
    isDrawing = true;
    currentPath = [getPos(e)];
    e.preventDefault();
  }

  function draw(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;
    currentPath.push(getPos(e));
    drawNaturalCurve(ctx!, [...currentPath], colorInput.value, parseInt(widthInput.value));
    e.preventDefault();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    // Bake the active stroke into the persistent memory canvas
    drawNaturalCurve(memCtx, [...currentPath], colorInput.value, parseInt(widthInput.value));
    paths.push([...currentPath]);
    currentPath = [];
    redraw();
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
    widthValue!.textContent = widthInput.value;
    debouncedRedraw();
  });

  clearBtn.addEventListener('click', () => {
    paths = [];
    memCtx.clearRect(0, 0, memCanvas.width, memCanvas.height);
    redraw()
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

    const baseWidth = parseInt(widthInput.value);
    const padding = baseWidth + 5;
    const cropW = maxX - minX + padding * 2;
    const cropH = maxY - minY + padding * 2;

    // 2. Generate PNG
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tCtx = tempCanvas.getContext('2d')!;

    paths.forEach((path) => {
      const shifted = path.map((p) => ({ ...p, x: p.x - minX + padding, y: p.y - minY + padding }));
      drawNaturalCurve(tCtx, shifted, colorInput.value, baseWidth);
    });

    const signature: SignatureData = {
      id: crypto.randomUUID(),
      image: tempCanvas.toDataURL('image/png'),
      width: cropW,
      height: cropH,
      timestamp: Date.now(),
      color: color,
      strokeWidth: baseWidth,
      rawPaths: paths,
    };

    const saved = savedSignatures();
    saved.unshift(signature);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    paths = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderSignatures();
  });

  function createFullSvg(sig: SignatureData): string {
    return generateSmoothSvg(sig.rawPaths, sig.width, sig.height, sig.color, sig.strokeWidth, {
      minX: 0,
      minY: 0,
    });
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
  baseWidth: number,
  bounds: { minX: number; minY: number }
): string {
  const padding = baseWidth + 5;
  let svgPaths = '';

  paths.forEach((path) => {
    if (path.length < 3) return;
    const getX = (p: Point) => (p.x - bounds.minX + padding).toFixed(2);
    const getY = (p: Point) => (p.y - bounds.minY + padding).toFixed(2);

    let d = `M ${getX(path[0])} ${getY(path[0])} `;
    for (let i = 1; i < path.length - 2; i++) {
      const midX = (path[i].x + path[i + 1].x) / 2;
      const midY = (path[i].y + path[i + 1].y) / 2;
      d += `Q ${getX(path[i])} ${getY(path[i])}, ${midX - bounds.minX + padding} ${midY - bounds.minY + padding} `;
    }
    svgPaths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${baseWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgPaths}</svg>`;
}
