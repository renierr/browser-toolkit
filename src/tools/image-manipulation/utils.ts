import { getSettings } from '@js/settings.ts';

export interface ModelConfig {
  id: string;
  name: string;
  url: string;
  input: string;
  output: string;
  padToMultipleOf?: number;
  mean?: number[]; // [r, g, b] default [0, 0, 0]
  std?: number[]; // [r, g, b] default [1, 1, 1]
  normalizeRange?: [number, number]; // e.g. [0, 1] or [-1, 1], default [0, 1]
  outputMean?: number[];
  outputStd?: number[];
  outputRange?: [number, number];
  bgr?: boolean;
}

export const MODELS: Record<string, ModelConfig> = {
  line_drawings: {
    id: 'line_drawings',
    name: 'Line Drawing',
    url: new URL('./lib/models/line-drawings.onnx?v=1.0.0', document.baseURI).href,
    input: 'input',
    output: 'output',
    padToMultipleOf: 2,
  },
  RealESRGAN_x2plus: {
    id: 'RealESRGAN_x2plus',
    name: 'RealESRGAN_x2plus',
    url: new URL('./lib/models/RealESRGAN_x2plus.onnx?v=1.0.0', document.baseURI).href,
    input: 'input',
    output: 'output',
    padToMultipleOf: 4,
  },
  RealESRGAN_x4plus: {
    id: 'RealESRGAN_x4plus',
    name: 'RealESRGAN_x4plus',
    url: new URL('./lib/models/RealESRGAN_x4plus.onnx?v=1.0.0', document.baseURI).href,
    input: 'input',
    output: 'output',
    padToMultipleOf: 4,
  },
  rrdbx2: {
    id: 'rrdbx2',
    name: 'rrdbx2',
    url: new URL('./lib/models/rrdbx2.onnx?v=1.0.0', document.baseURI).href,
    input: 'pixel_values',
    output: 'reconstruction',
    padToMultipleOf: 8,
  },
  rrdbx4: {
    id: 'rrdbx4',
    name: 'rrdbx4',
    url: new URL('./lib/models/rrdbx4.onnx?v=1.0.0', document.baseURI).href,
    input: 'pixel_values',
    output: 'reconstruction',
    padToMultipleOf: 8,
  },
  swin2sr: {
    id: 'swin2sr',
    name: 'Swin2SR Upscale (x2)',
    url: new URL('./lib/models/swin2sr.onnx?v=1.0.0', document.baseURI).href,
    input: 'pixel_values',
    output: 'reconstruction',
    padToMultipleOf: 8,
  },
  iat_lol_v2: {
    id: 'iat_lol_v2',
    name: 'Low-light Enhancement (IAT)',
    url: new URL('./lib/models/iat_lol_v2.onnx?v=1.0.0', document.baseURI).href,
    input: 'input',
    output: 'enhanced',
    padToMultipleOf: 8,
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
    outputMean: [0, 0, 0],
    outputStd: [1, 1, 1],
  },
  iat_exposure: {
    id: 'iat_exposure',
    name: 'Exposure Correction (IAT)',
    url: new URL('./lib/models/iat_exposure.emb.onnx?v=1.0.0', document.baseURI).href,
    input: 'input',
    output: 'enhanced',
    padToMultipleOf: 8,
    outputMean: [0, 0, 0],
    outputStd: [1, 1, 1],
  },
};

export interface ProcessingOptions {
  modelId: string;
  forceWasm: boolean;
  largeThreshold: number;
  maxDimension: number; // 0 for native
  modelConfig: ModelConfig;
}

export interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error' | 'hold';
  originalUrl: string;
  resultUrl?: string;
  resultBlob?: Blob;
  formattedSize: string;
  options: ProcessingOptions;
}
export function getProcessingOptions(): ProcessingOptions {
  const settings = getSettings('image-manipulation');
  const modelId = settings.get('model', 'line_drawings');
  const forceWasm = settings.get('forceWasm', false);
  const largeThreshold = settings.get('largeThreshold', 512);
  const maxDimension = Number(settings.get('maxDimension', 0));

  return { modelId, forceWasm, largeThreshold, maxDimension, modelConfig: MODELS[modelId] };
}
