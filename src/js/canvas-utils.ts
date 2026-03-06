import { hideProgress, showProgress } from './ui.ts';
import { downloadFile } from './file-utils.ts';
import { copyImageBlobToClipboard, offscreenCanvasToBlob } from './image-utils.ts';

type ImageFormat = 'jpg' | 'webp' | 'png';

export class CanvasExporter {
  private static readonly MIME_MAP: Record<ImageFormat, string> = {
    jpg: 'image/jpeg',
    webp: 'image/webp',
    png: 'image/png',
  };

  static async download(
    canvas: HTMLCanvasElement,
    filename: string = 'canvas_image',
    format: ImageFormat = 'png',
    quality: number = 0.92
  ): Promise<void> {
    showProgress(`Preparing ${format.toUpperCase()} download...`);

    try {
      const mimeType = this.MIME_MAP[format];

      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          async (blob) => {
            if (!blob) return reject(new Error('Failed to create blob'));
            try {
              await downloadFile(blob, `${filename}.${format}`);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          mimeType,
          quality
        );
      });
    } finally {
      hideProgress();
    }
  }

  static async copyToClipboard(canvas: HTMLCanvasElement): Promise<void> {
    showProgress('Copying to clipboard...');

    try {
      const bitmap = await createImageBitmap(canvas);
      const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = offscreen.getContext('2d');
      ctx?.drawImage(bitmap, 0, 0);
      bitmap.close();

      const blob = await offscreenCanvasToBlob(offscreen, 'image/png');
      await copyImageBlobToClipboard(blob);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      throw err;
    } finally {
      hideProgress();
    }
  }
}
