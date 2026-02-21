export function sourceToCanvas(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement('canvas');
  if (source instanceof HTMLVideoElement) {
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
  } else {
    canvas.width = source.width;
    canvas.height = source.height;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return canvas;
}
