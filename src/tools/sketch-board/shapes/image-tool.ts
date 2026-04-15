import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';
import type { ImageElement } from '../types.ts';

export class ImageTool implements DrawTool {
  readonly mode = 'image' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set();

  private fileInput: HTMLInputElement | null = null;
  private onInsert: ((el: ImageElement) => void) | null = null;
  private getCanvasCenter: (() => Point) | null = null;

  setOnInsert(callback: (el: ImageElement) => void): void {
    this.onInsert = callback;
  }

  setGetCanvasCenter(callback: () => Point): void {
    this.getCanvasCenter = callback;
  }

  onPointerDown(_point: Point, _ctx: DrawToolContext): void {}

  onPointerMove(_point: Point, _ctx: DrawToolContext): void {}

  onPointerUp(_point: Point, _ctx: DrawToolContext): SketchElement | null {
    return null;
  }

  drawPreview(_canvasCtx: CanvasRenderingContext2D, _ctx: DrawToolContext): void {}

  drawSegment(_canvasCtx: CanvasRenderingContext2D, _ctx: DrawToolContext): void {}

  triggerFileInput(): void {
    if (!this.fileInput) {
      this.fileInput = document.createElement('input');
      this.fileInput.type = 'file';
      this.fileInput.accept = 'image/*';
      this.fileInput.hidden = true;
      this.fileInput.addEventListener('change', this.handleFileSelect);
      document.body.appendChild(this.fileInput);
    }
    this.fileInput.click();
  }

  private handleFileSelect = (): void => {
    const file = this.fileInput?.files?.[0];
    if (!file) return;
    this.loadImageFromFile(file);
  };

  private loadImageFromFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl && this.onInsert) {
        this.createImageElement(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  async pasteFromClipboard(): Promise<boolean> {
    if (!navigator.clipboard) return false;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const reader = new FileReader();
            return new Promise<boolean>((resolve) => {
              reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                if (dataUrl && this.onInsert) {
                  this.createImageElement(dataUrl);
                  resolve(true);
                } else {
                  resolve(false);
                }
              };
              reader.readAsDataURL(blob);
            });
          }
        }
      }
      return false;
    } catch {
      console.error('[ImageTool] Clipboard read failed');
      return false;
    }
  }

  private createImageElement(imageData: string): void {
    const img = new Image();
    img.onload = (): void => {
      if (!this.onInsert) return;
      const center = this.getCanvasCenter?.() ?? { x: 0, y: 0 };
      const maxSize = 300;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const aspect = w / h;
      if (w > maxSize || h > maxSize) {
        if (w > h) {
          w = maxSize;
          h = Math.round(maxSize / aspect);
        } else {
          h = maxSize;
          w = Math.round(maxSize * aspect);
        }
      }
      const element: ImageElement = {
        id: crypto.randomUUID(),
        type: 'image',
        color: '#000000',
        width: 1,
        position: {
          x: center.x - w / 2,
          y: center.y - h / 2,
        },
        imageWidth: w,
        imageHeight: h,
        imageData,
      };
      this.onInsert(element);
    };
    img.src = imageData;
  }

  reset(): void {}
}
