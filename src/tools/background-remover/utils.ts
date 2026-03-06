import { convertBlobFormat, copyImageBlobToClipboard } from '../../js/image-utils';
import { hideProgress, showMessage, showProgress } from '../../js/ui';

export interface ProcessingOptions {
  threshold: number;
  smoothing: number;
  contrast: number;
  useGuidedFilter: boolean;
}

export interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error';
  resultBlob?: Blob;
  resultUrl?: string;
  originalUrl: string;
  rawMask?: Float32Array;
  formattedSize: string;
  width?: number;
  height?: number;
  options: ProcessingOptions;
}

export function getSelectedFormat(): 'png' | 'webp' {
  const radio = document.querySelector<HTMLInputElement>('input[name="download-format"]:checked');
  return (radio?.value as 'png' | 'webp') || 'png';
}

export function getWebpQuality(): number {
  const el = document.getElementById('opt-quality') as HTMLInputElement | null;
  return el ? parseInt(el.value, 10) / 100 : 0.92;
}

export function getProcessingOptions(): ProcessingOptions {
  const threshold = parseInt((document.getElementById('opt-threshold') as HTMLInputElement)?.value ?? '128', 10);
  const smoothing = parseInt((document.getElementById('opt-smooth') as HTMLInputElement)?.value ?? '4', 10);
  const contrast = parseFloat((document.getElementById('opt-contrast') as HTMLInputElement)?.value ?? '1.0');
  const useGuidedFilter = (document.getElementById('opt-refine') as HTMLInputElement)?.checked ?? false;
  return { threshold, smoothing, contrast, useGuidedFilter };
}

export async function convertBlobToFormat(blob: Blob, format: 'png' | 'webp', quality: number): Promise<Blob> {
  if (format === 'png') return blob;
  return convertBlobFormat(blob, 'image/webp', quality);
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  showProgress('Copying to clipboard...');
  try {
    await copyImageBlobToClipboard(blob);
    showMessage('Copied to clipboard!', { type: 'info', timeoutMs: 2000 });
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showMessage('Failed to copy to clipboard.', { type: 'alert' });
  } finally {
    hideProgress();
  }
}

export function getOutputFilename(originalName: string, format: 'png' | 'webp'): string {
  return `${originalName.replace(/\.[^/.]+$/, '')}-no-bg.${format}`;
}
