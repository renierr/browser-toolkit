import { showMessage } from '@js/ui.ts';
import type { SketchDom } from '../dom.ts';
import type { ImageTool } from '../shapes/image-tool.ts';

export function setupImageEvents(
  dom: SketchDom,
  imageTool: ImageTool,
  getCanvasCenter: () => { x: number; y: number },
  hideDrawTools: () => void
) {
  dom.btnImportImage.addEventListener('click', () => {
    imageTool.setGetCanvasCenter(getCanvasCenter);
    (document.activeElement as HTMLElement)?.blur();
    hideDrawTools();
    imageTool.triggerFileInput();
  });

  dom.btnPasteImage.addEventListener('click', async () => {
    imageTool.setGetCanvasCenter(getCanvasCenter);
    (document.activeElement as HTMLElement)?.blur();
    hideDrawTools();
    const pasted = await imageTool.pasteFromClipboard();
    if (!pasted) {
      showMessage('No image in clipboard or permission denied.', {
        type: 'alert',
        timeoutMs: 2000,
      });
    }
  });
}
