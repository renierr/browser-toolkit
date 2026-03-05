import { PaddleOCR } from './paddle-ocr';

const ocr = new PaddleOCR();

self.onmessage = async (e: MessageEvent) => {
  const { type, imageData, boxes } = e.data;

  try {
    if (type === 'init') {
      await ocr.init(e.data.detModelUrl, e.data.recModelUrl);
      self.postMessage({ type: 'init-done' });
    } else if (type === 'detect') {
      const detectedBoxes = await ocr.detect(imageData, (progress) => {
        self.postMessage({ type: 'progress', progress });
      });
      self.postMessage({ type: 'detect-done', boxes: detectedBoxes });
    } else if (type === 'recognize') {
      const results = await ocr.recognize(imageData, boxes, (progress) => {
        self.postMessage({ type: 'progress', progress });
      });
      self.postMessage({ type: 'recognize-done', text: results.join('\n') });
    }
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};
