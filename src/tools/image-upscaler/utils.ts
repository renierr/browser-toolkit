export interface ModelConfig {
  id: string;
  name: string;
  url: string;
}

export const MODELS: Record<string, ModelConfig> = {
  RealESRGAN_x2plus: {
    id: 'RealESRGAN_x2plus',
    name: 'RealESRGAN_x2plus',
    url: new URL('./lib/models/RealESRGAN_x2plus.onnx', document.baseURI).href,
  },
  RealESRGAN_x4plus: {
    id: 'RealESRGAN_x2plus',
    name: 'RealESRGAN_x2plus',
    url: new URL('./lib/models/RealESRGAN_x4plus.onnx', document.baseURI).href,
  },
};

export interface ProcessingOptions {
  modelId: string;
  modelUrl: string;
  forceWasm: boolean;
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

  return { modelId, modelUrl: MODELS[modelId].url, forceWasm };
}
