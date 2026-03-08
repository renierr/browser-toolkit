import { convertBlobFormat, copyImageBlobToClipboard } from '../../js/image-utils';
import { hideProgress, showMessage, showProgress } from '../../js/ui';
import { getSettings } from '../../js/settings.ts';

export interface ModelConfig {
  id: string;
  name: string;
  url: string;
  inputSize: number;
  mean: [number, number, number];
  std: [number, number, number];
}

export const MODELS: Record<string, ModelConfig> = {
  silueta: {
    id: 'silueta',
    name: 'Silueta',
    url: new URL('./lib/models/silueta.onnx', document.baseURI).href,
    inputSize: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  u2netp: {
    id: 'u2netp',
    name: 'U2NetP',
    url: new URL('./lib/models/u2netp-q.onnx', document.baseURI).href,
    inputSize: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  }
};

export interface ProcessingOptions {
  threshold: number;
  smoothing: number;
  contrast: number;
  useGuidedFilter: boolean;
  modelId: string;
  forceWasm: boolean;
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
  const settings = getSettings('background-remover');

  const threshold = settings.get('threshold', 128);
  const smoothing = settings.get('smoothing', 4);
  const contrast = settings.get('contrast', 1.0);
  const useGuidedFilter = settings.get('refine', false);
  const modelId = settings.get('model', 'silueta');
  const forceWasm = settings.get('forceWasm', false);

  return { threshold, smoothing, contrast, useGuidedFilter, modelId, forceWasm };
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
