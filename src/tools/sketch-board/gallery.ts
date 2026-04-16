import { CanvasExporter } from '@js/canvas-utils.ts';
import { showMessage } from '@js/ui.ts';
import { buildMeta, getCropBounds, makeThumbnail } from './drawing.ts';
import type { SketchDom } from './dom.ts';
import { deleteDrawing, getAllDrawings, putDrawing } from './store.ts';
import type { DrawingRecord, SketchElement, ToolMode, ViewportState } from './types.ts';

export async function renderGallery(
  dom: SketchDom,
  onLoad: (record: DrawingRecord) => void
): Promise<void> {
  const rows = await getAllDrawings();
  dom.galleryList.innerHTML = '';

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'col-span-full text-sm opacity-70';
    empty.textContent = 'No drawings saved yet.';
    dom.galleryList.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const node = dom.galleryTemplate.content.cloneNode(true) as DocumentFragment;
    const root = node.querySelector('article');
    const thumb = node.querySelector('.gallery-thumb') as HTMLImageElement | null;
    const name = node.querySelector('.gallery-name') as HTMLDivElement | null;
    const meta = node.querySelector('.gallery-meta') as HTMLDivElement | null;
    const btnLoad = node.querySelector('.load-drawing') as HTMLButtonElement | null;
    const btnDelete = node.querySelector('.delete-drawing') as HTMLButtonElement | null;

    if (!root || !thumb || !name || !meta || !btnLoad || !btnDelete) continue;

    thumb.src = row.thumbnailDataUrl;
    name.textContent = row.name;
    meta.textContent = `${new Date(row.updatedAt).toLocaleString()} - ${row.meta.elementCount} elements`;

    btnLoad.addEventListener('click', () => {
      onLoad(row);
      dom.galleryModal.close();
    });

    btnDelete.addEventListener('click', async () => {
      await deleteDrawing(row.id);
      await renderGallery(dom, onLoad);
    });

    dom.galleryList.appendChild(node);
  }
}

export async function saveDrawing(
  elements: SketchElement[],
  viewport: ViewportState,
  mode: ToolMode,
  background: string = 'checkerboard-bg'
): Promise<boolean> {
  if (elements.length === 0) {
    showMessage('Nothing to save yet.', { type: 'warning', timeoutMs: 2500 });
    return false;
  }

  const nameInput = window.prompt('Version name:', `Drawing ${new Date().toLocaleString()}`);
  if (!nameInput) return false;

  const bounds = getCropBounds(elements);
  const thumbUrl = bounds ? makeThumbnail(elements) : '';

  const now = Date.now();
  const record: DrawingRecord = {
    id: crypto.randomUUID(),
    name: nameInput.trim(),
    createdAt: now,
    updatedAt: now,
    viewport: { ...viewport },
    elements: elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement),
    thumbnailDataUrl: thumbUrl,
    meta: buildMeta(elements, mode, background),
  };

  try {
    await putDrawing(record);
    showMessage(`Saved version "${record.name}".`, { timeoutMs: 2500 });
    return true;
  } catch (error) {
    console.error('[SketchBoard] Failed to save drawing', error);
    showMessage('Failed to save drawing.', { type: 'alert', timeoutMs: 3000 });
    return false;
  }
}

export async function exportDrawing(
  tempCanvas: HTMLCanvasElement | null,
  format: 'png' | 'jpg' | 'webp'
): Promise<void> {
  if (!tempCanvas) {
    showMessage('Nothing to export.', { type: 'warning', timeoutMs: 2500 });
    return;
  }

  try {
    await CanvasExporter.download(tempCanvas, `sketch-${Date.now()}`, format, 0.92);
  } catch (error) {
    console.error('[SketchBoard] Export failed', error);
    showMessage('Export failed.', { type: 'alert', timeoutMs: 3000 });
  }
}

export async function shareDrawing(
  tempCanvas: HTMLCanvasElement | null,
  format: 'png' | 'jpg' | 'webp'
): Promise<void> {
  if (!tempCanvas) {
    showMessage('Nothing to share.', { type: 'warning', timeoutMs: 2500 });
    return;
  }

  try {
    await CanvasExporter.share(tempCanvas, `sketch-${Date.now()}`, format, 0.92);
  } catch (error) {
    console.error('[SketchBoard] Share failed', error);
    showMessage('Share failed.', { type: 'alert', timeoutMs: 3000 });
  }
}

export async function copyToClipboard(tempCanvas: HTMLCanvasElement | null): Promise<void> {
  if (!tempCanvas) {
    showMessage('Nothing to copy.', { type: 'warning', timeoutMs: 2500 });
    return;
  }

  try {
    await CanvasExporter.copyToClipboard(tempCanvas);
    showMessage('Copied canvas image to clipboard.', { timeoutMs: 2500 });
  } catch (error) {
    console.error('[SketchBoard] Clipboard copy failed', error);
    showMessage('Clipboard copy failed.', { type: 'alert', timeoutMs: 3000 });
  }
}
