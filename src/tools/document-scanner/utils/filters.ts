export function applyFilters(
  originalImage: HTMLImageElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  filter: 'none' | 'grayscale' | 'b&w' | 'clean'
) {
  canvas.width = originalImage.width;
  canvas.height = originalImage.height;
  ctx.drawImage(originalImage, 0, 0);

  if (filter === 'none') return;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (filter === 'grayscale') {
      data[i] = data[i + 1] = data[i + 2] = gray;
    } else if (filter === 'b&w') {
      const val = gray > 128 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = val;
    } else if (filter === 'clean') {
      const val = Math.min(255, gray * 1.2);
      data[i] = data[i + 1] = data[i + 2] = val > 200 ? 255 : val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
