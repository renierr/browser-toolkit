export interface ModelConfig {
  id: string;
  name: string;
  url: string;
  input: string;
  output: string;
}

export const MODELS: Record<string, ModelConfig> = {
  RealESRGAN_x2plus: {
    id: 'RealESRGAN_x2plus',
    name: 'RealESRGAN_x2plus',
    url: new URL('./lib/models/RealESRGAN_x2plus.onnx', document.baseURI).href,
    input: 'input',
    output: 'output',
  },
  RealESRGAN_x4plus: {
    id: 'RealESRGAN_x4plus',
    name: 'RealESRGAN_x4plus',
    url: new URL('./lib/models/RealESRGAN_x4plus.onnx', document.baseURI).href,
    input: 'input',
    output: 'output',
  },
  rrdbx2: {
    id: 'rrdbx2',
    name: 'rrdbx2',
    url: new URL('./lib/models/rrdbx2.onnx', document.baseURI).href,
    input: 'pixel_values',
    output: 'reconstruction',
  },
  rrdbx4: {
    id: 'rrdbx4',
    name: 'rrdbx4',
    url: new URL('./lib/models/rrdbx4.onnx', document.baseURI).href,
    input: 'pixel_values',
    output: 'reconstruction',
  },
};

export interface ProcessingOptions {
  modelId: string;
  forceWasm: boolean;
  modelConfig: ModelConfig;
}

export interface ImageQueueItem {
  id: string;
  file: File;
  element: HTMLElement;
  status: 'pending' | 'processing' | 'done' | 'error';
  originalUrl: string;
  resultUrl?: string;
  resultBlob?: Blob;
  formattedSize: string;
  options: ProcessingOptions;
}
export function getProcessingOptions(): ProcessingOptions {
  const modelId =
    (document.getElementById('opt-model') as HTMLSelectElement)?.value ?? 'RealESRGAN_x2plus';
  const forceWasm =
    (document.getElementById('opt-force-wasm') as HTMLInputElement)?.checked ?? false;

  return { modelId, forceWasm, modelConfig: MODELS[modelId] };
}
