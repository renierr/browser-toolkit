import type { FilterType } from '../types';

export function applyFilters(
  source: HTMLImageElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  filter: FilterType
) {
  canvas.width = source.width;
  canvas.height = source.height;
  ctx.drawImage(source, 0, 0);

  if (filter === 'none') return;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  if (filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
  } else if (filter === 'b&w') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const val = gray > 128 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = val;
    }
  } else if (filter === 'clean') {
    // Adaptive local-mean thresholding for document whitening.
    // Computes a local mean in a window around each pixel,
    // then brightens pixels that are close to or above the local background.
    const w = canvas.width;
    const h = canvas.height;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // Integral image for fast local mean
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x];
        integral[(y + 1) * (w + 1) + (x + 1)] = rowSum + integral[y * (w + 1) + (x + 1)];
      }
    }

    const radius = Math.max(8, Math.round(Math.min(w, h) * 0.04));
    const iw = w + 1;

    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h, y + radius + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(w, x + radius + 1);
        const area = (x1 - x0) * (y1 - y0);
        const sum = integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0];
        const localMean = sum / area;
        const px = gray[y * w + x];

        // If pixel is close to or brighter than local mean → push to white
        // If pixel is significantly darker → it's ink/text, keep and enhance contrast
        let val: number;
        if (px > localMean * 0.85) {
          val = 255; // background → white
        } else {
          // Text/ink: map [0, localMean*0.85] → [0, 180] for good contrast
          val = Math.round((px / (localMean * 0.85)) * 180);
        }

        const i4 = (y * w + x) * 4;
        data[i4] = data[i4 + 1] = data[i4 + 2] = val;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
