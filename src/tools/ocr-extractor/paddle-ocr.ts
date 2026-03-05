import { ort, loadSession, runInference } from '../../js/onnx-utils';
import { LATIN_DICT } from './dict';

export interface OcrResult {
  text: string;
  confidence: number;
  box: [number, number, number, number][];
}

export class PaddleOCR {
  private detSession: ort.InferenceSession | null = null;
  private recSession: ort.InferenceSession | null = null;

  async init(detModelPath: string, recModelPath: string) {
    this.detSession = await loadSession({
      modelPath: detModelPath,
    });
    this.recSession = await loadSession({
      modelPath: recModelPath,
    });
  }

  async detect(imageData: ImageData): Promise<number[][][]> {
    if (!this.detSession) throw new Error('Detection session not initialized');

    // Preprocess
    const { tensor, scaleH, scaleW } = await this.preprocessDet(imageData);

    // Run inference
    const output = await runInference(this.detSession, { x: tensor });
    const probMap = output[Object.keys(output)[0]];

    // Postprocess
    const boxes = this.postprocessDet(probMap as ort.Tensor, scaleH, scaleW);
    return boxes;
  }

  async recognize(imageData: ImageData, boxes: number[][][], onProgress?: (p: number) => void): Promise<string[]> {
    if (!this.recSession) throw new Error('Recognition session not initialized');

    // Group boxes into lines (Reading Order)
    const lineGroups = this.groupBoxesIntoLines(boxes);

    const lineTexts: string[] = [];
    let processedBoxes = 0;
    const totalBoxes = boxes.length;

    for (const line of lineGroups) {
      let lineText = '';

      for (const box of line) {
        const crop = await this.getRotateCropImage(imageData, box);
        const recTensor = await this.preprocessRec(crop);

        const recOutput = await runInference(this.recSession, { x: recTensor });
        const logits = recOutput[Object.keys(recOutput)[0]];

        const text = this.decode(logits as ort.Tensor);

        // Add space between words found in the same line box group
        if (lineText.length > 0 && text.length > 0) {
          lineText += ' ';
        }
        lineText += text;

        processedBoxes++;
        if (onProgress) onProgress((processedBoxes / totalBoxes) * 100);
      }
      lineTexts.push(lineText);
    }

    return lineTexts;
  }

  private async preprocessDet(imageData: ImageData) {
    const { width, height } = imageData;
    const targetSize = 960;
    let newW = targetSize;
    let newH = targetSize;

    if (width > height) {
      newH = Math.round(height * (targetSize / width) / 32) * 32;
    } else {
      newW = Math.round(width * (targetSize / height) / 32) * 32;
    }

    const canvas = new OffscreenCanvas(newW, newH);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    const imgBitmap = await createImageBitmap(imageData, {
      resizeWidth: newW,
      resizeHeight: newH,
      resizeQuality: 'high'
    });
    ctx.drawImage(imgBitmap, 0, 0);
    const resizedData = ctx.getImageData(0, 0, newW, newH).data;
    imgBitmap.close();

    const floatData = new Float32Array(3 * newH * newW);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    for (let i = 0; i < newH * newW; i++) {
      floatData[i] = (resizedData[i * 4] / 255 - mean[0]) / std[0];
      floatData[i + newH * newW] = (resizedData[i * 4 + 1] / 255 - mean[1]) / std[1];
      floatData[i + 2 * newH * newW] = (resizedData[i * 4 + 2] / 255 - mean[2]) / std[2];
    }

    return {
      tensor: new ort.Tensor('float32', floatData, [1, 3, newH, newW]),
      scaleH: newH / height,
      scaleW: newW / width,
    };
  }

  private postprocessDet(probMap: ort.Tensor, scaleH: number, scaleW: number): number[][][] {
    const [, , h, w] = probMap.dims;
    const data = probMap.data as Float32Array;
    const threshold = 0.3;
    const binaryMap = new Uint8Array(h * w);
    for (let i = 0; i < h * w; i++) {
      binaryMap[i] = data[i] > threshold ? 255 : 0;
    }

    const dilatedMap = new Uint8Array(h * w);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (binaryMap[y * w + x] === 255) {
          dilatedMap[y * w + x] = 255;
          dilatedMap[(y - 1) * w + x] = 255;
          dilatedMap[(y + 1) * w + x] = 255;
          dilatedMap[y * w + x - 1] = 255;
          dilatedMap[y * w + x + 1] = 255;
        }
      }
    }

    const contours = this.findContours(dilatedMap, h, w);
    const boxes: number[][][] = [];

    for (const contour of contours) {
      if (contour.length < 4) continue;
      let box = this.getMinAreaRect(contour);
      const score = this.boxScore(data, box, h, w);
      if (score < 0.5) continue;

      const unclippedBox = this.unclipBox(box, 1.5);
      const rescaledBox = unclippedBox.map((p: number[]) => [
        Math.max(0, p[0] / scaleW),
        Math.max(0, p[1] / scaleH)
      ]);
      boxes.push(rescaledBox);
    }

    return this.mergeOverlappingBoxes(boxes);
  }

  private mergeOverlappingBoxes(boxes: number[][][]): number[][][] {
    if (boxes.length === 0) return [];
    const sorted = boxes.map(box => {
      const minX = Math.min(...box.map(p => p[0]));
      const maxX = Math.max(...box.map(p => p[0]));
      const minY = Math.min(...box.map(p => p[1]));
      const maxY = Math.max(...box.map(p => p[1]));
      return { box, area: (maxX - minX) * (maxY - minY) };
    }).sort((a, b) => b.area - a.area);

    const result: number[][][] = [];
    for (const item of sorted) {
      let keep = true;
      for (const kept of result) {
        if (this.calculateIoU(item.box, kept) > 0.4) {
          keep = false;
          break;
        }
      }
      if (keep) result.push(item.box);
    }
    return result;
  }

  private calculateIoU(box1: number[][], box2: number[][]): number {
    const getBounds = (box: number[][]) => ({
      minX: Math.min(...box.map(p => p[0])),
      maxX: Math.max(...box.map(p => p[0])),
      minY: Math.min(...box.map(p => p[1])),
      maxY: Math.max(...box.map(p => p[1]))
    });
    const b1 = getBounds(box1);
    const b2 = getBounds(box2);

    const interX1 = Math.max(b1.minX, b2.minX);
    const interY1 = Math.max(b1.minY, b2.minY);
    const interX2 = Math.min(b1.maxX, b2.maxX);
    const interY2 = Math.min(b1.maxY, b2.maxY);

    if (interX2 <= interX1 || interY2 <= interY1) return 0;
    const interArea = (interX2 - interX1) * (interY2 - interY1);
    const area1 = (b1.maxX - b1.minX) * (b1.maxY - b1.minY);
    const area2 = (b2.maxX - b2.minX) * (b2.maxY - b2.minY);
    return interArea / (area1 + area2 - interArea);
  }

  private decode(logits: ort.Tensor): string {
    const [, timesteps, numClasses] = logits.dims;
    const data = logits.data as Float32Array;
    let text = '';
    let lastCharIdx = -1;

    for (let t = 0; t < timesteps; t++) {
      let maxIdx = 0;
      let maxProb = -Infinity;
      for (let c = 0; c < numClasses; c++) {
        const p = data[t * numClasses + c];
        if (p > maxProb) {
          maxProb = p;
          maxIdx = c;
        }
      }
      if (maxIdx > 0 && maxIdx !== lastCharIdx) {
        const char = LATIN_DICT[maxIdx];
        if (char) text += char;
      }
      lastCharIdx = maxIdx;
    }
    return text;
  }

  private async getRotateCropImage(imageData: ImageData, box: number[][]): Promise<ImageData> {
    const sorted = [...box].sort((a, b) => a[1] - b[1]);
    const top = sorted.slice(0, 2).sort((a, b) => a[0] - b[0]);
    const bottom = sorted.slice(2, 4).sort((a, b) => a[0] - b[0]);
    const tl = top[0], tr = top[1], br = bottom[1], bl = bottom[0];

    const width = Math.max(
      Math.sqrt(Math.pow(tr[0] - tl[0], 2) + Math.pow(tr[1] - tl[1], 2)),
      Math.sqrt(Math.pow(br[0] - bl[0], 2) + Math.pow(br[1] - bl[1], 2))
    );
    const height = Math.max(
      Math.sqrt(Math.pow(tl[0] - bl[0], 2) + Math.pow(tl[1] - bl[1], 2)),
      Math.sqrt(Math.pow(tr[0] - br[0], 2) + Math.pow(tr[1] - br[1], 2))
    );

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    const angle = Math.atan2(tr[1] - tl[1], tr[0] - tl[0]);
    ctx.save();
    ctx.rotate(-angle);
    ctx.translate(-tl[0], -tl[1]);

    const bitmap = await createImageBitmap(imageData);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    ctx.restore();

    return ctx.getImageData(0, 0, width, height);
  }

  private async preprocessRec(imageData: ImageData) {
    const { width, height } = imageData;
    const targetH = 48;
    const targetW = Math.max(Math.round(width * (targetH / height)), 32);
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, targetW, targetH);

    const bitmap = await createImageBitmap(imageData, {
      resizeWidth: targetW,
      resizeHeight: targetH,
      resizeQuality: 'high'
    });
    ctx.drawImage(bitmap, 0, 0);
    const resizedData = ctx.getImageData(0, 0, targetW, targetH).data;
    bitmap.close();

    const floatData = new Float32Array(3 * targetH * targetW);
    for (let i = 0; i < targetH * targetW; i++) {
      floatData[i] = (resizedData[i * 4] / 255 - 0.5) / 0.5;
      floatData[i + targetH * targetW] = (resizedData[i * 4 + 1] / 255 - 0.5) / 0.5;
      floatData[i + 2 * targetH * targetW] = (resizedData[i * 4 + 2] / 255 - 0.5) / 0.5;
    }
    return new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
  }

  private findContours(binaryMap: Uint8Array, h: number, w: number): number[][][] {
    const visited = new Uint8Array(h * w);
    const contours: number[][][] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (binaryMap[y * w + x] === 255 && !visited[y * w + x]) {
          const contour = this.traceContour(binaryMap, visited, x, y, h, w);
          if (contour.length > 10) contours.push(contour);
        }
      }
    }
    return contours;
  }

  private traceContour(binaryMap: Uint8Array, visited: Uint8Array, startX: number, startY: number, h: number, w: number): number[][] {
    const contour: number[][] = [];
    let currX = startX, currY = startY;
    const dx = [1, 1, 0, -1, -1, -1, 0, 1], dy = [0, 1, 1, 1, 0, -1, -1, -1];
    let dir = 7;
    do {
      visited[currY * w + currX] = 1;
      contour.push([currX, currY]);
      let found = false;
      for (let i = 0; i < 8; i++) {
        const checkDir = (dir + i) % 8;
        const nx = currX + dx[checkDir], ny = currY + dy[checkDir];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && binaryMap[ny * w + nx] === 255) {
          currX = nx; currY = ny;
          dir = (checkDir + 5) % 8;
          found = true;
          break;
        }
      }
      if (!found) break;
    } while (!(currX === startX && currY === startY) && contour.length < 1000);
    return contour;
  }

  private getMinAreaRect(contour: number[][]): number[][] {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of contour) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  }

  private boxScore(data: Float32Array, box: number[][], h: number, w: number): number {
    let sum = 0, count = 0;
    const minX = Math.floor(Math.min(...box.map(p => p[0])));
    const maxX = Math.ceil(Math.max(...box.map(p => p[0])));
    const minY = Math.floor(Math.min(...box.map(p => p[1])));
    const maxY = Math.ceil(Math.max(...box.map(p => p[1])));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          sum += data[y * w + x];
          count++;
        }
      }
    }
    return count > 0 ? sum / count : 0;
  }

  private unclipBox(box: number[][], ratio: number): number[][] {
    const centerX = box.reduce((s, p) => s + p[0], 0) / 4;
    const centerY = box.reduce((s, p) => s + p[1], 0) / 4;
    return box.map(p => [
      centerX + (p[0] - centerX) * ratio,
      centerY + (p[1] - centerY) * ratio
    ]);
  }

  private groupBoxesIntoLines(boxes: number[][][]): number[][][][] {
    if (boxes.length === 0) return [];
    const boxInfo = boxes.map(box => {
      const minX = Math.min(...box.map(p => p[0])), maxX = Math.max(...box.map(p => p[0])),
        minY = Math.min(...box.map(p => p[1])), maxY = Math.max(...box.map(p => p[1]));
      return { box, minX, maxX, minY, maxY, centerY: (minY + maxY) / 2, height: maxY - minY };
    });
    boxInfo.sort((a, b) => a.centerY - b.centerY);
    const lines: (typeof boxInfo)[] = [];
    if (boxInfo.length > 0) {
      let currentLine = [boxInfo[0]];
      lines.push(currentLine);
      for (let i = 1; i < boxInfo.length; i++) {
        const lineY = currentLine.reduce((acc, b) => acc + b.centerY, 0) / currentLine.length;
        const currentBox = boxInfo[i];
        if (Math.abs(currentBox.centerY - lineY) < currentBox.height * 0.7) currentLine.push(currentBox);
        else { currentLine = [currentBox]; lines.push(currentLine); }
      }
    }
    return lines.map(line => line.sort((a, b) => a.minX - b.minX).map(b => b.box));
  }
}
