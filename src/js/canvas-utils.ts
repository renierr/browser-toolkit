import { hideProgress, showProgress } from './ui.ts';
import { downloadFile } from './file-utils.ts';

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
      let blob: Blob | null;

      // Feature detection for the fast path
      if ('OffscreenCanvas' in window && 'createImageBitmap' in window) {
        const bitmap = await createImageBitmap(canvas);
        const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = offscreen.getContext('2d');
        ctx?.drawImage(bitmap, 0, 0);
        blob = await offscreen.convertToBlob({ type: 'image/png' });
        bitmap.close();
      } else {
        // Standard Fallback
        blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      }

      if (!blob) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error('Blob generation failed');
      }

      const data = [new ClipboardItem({ [blob.type]: blob })];
      await navigator.clipboard.write(data);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      throw err;
    } finally {
      hideProgress();
    }
  }
}
