import { CanvasExporter } from '@js/canvas-utils.ts';
import { downloadFile } from '@js/file-utils.ts';
import { showMessage, yieldToUI } from '@js/ui.ts';
import { buildMeta, getCropBounds, makeThumbnail } from './drawing.ts';
import type { SketchDom } from './dom.ts';
import { deleteDrawing, getAllDrawings, putDrawing } from './store.ts';
import type {
  DrawingRecord,
  GalleryExport,
  SketchElement,
  ToolMode,
  ViewportState,
} from './types.ts';

export async function renderGallery(
  dom: SketchDom,
  onLoad: (record: DrawingRecord) => void
): Promise<void> {
  const rows = await getAllDrawings();
  dom.galleryList.innerHTML = '';

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-sm opacity-70 italic';
    empty.textContent = 'No drawings saved yet.';
    dom.galleryList.appendChild(empty);
    return;
  }

  // Group by week
  const groups = new Map<string, DrawingRecord[]>();
  for (const row of rows) {
    const weekId = getWeekIdentifier(new Date(row.updatedAt));
    if (!groups.has(weekId)) groups.set(weekId, []);
    groups.get(weekId)!.push(row);
  }

  // Sort weeks descending
  const sortedWeeks = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

  for (const weekId of sortedWeeks) {
    const records = groups.get(weekId)!;
    const isFirst = weekId === sortedWeeks[0];

    const details = document.createElement('details');
    details.className = 'collapse collapse-arrow bg-base-200/50 border border-base-300';
    if (isFirst) details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'collapse-title text-sm font-bold flex items-center gap-2';
    summary.textContent = getWeekLabel(weekId);
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className =
      'collapse-content grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4';

    for (const row of records) {
      const node = dom.galleryTemplate.content.cloneNode(true) as DocumentFragment;
      const thumb = node.querySelector('.gallery-thumb') as HTMLImageElement | null;
      const name = node.querySelector('.gallery-name') as HTMLDivElement | null;
      const meta = node.querySelector('.gallery-meta') as HTMLDivElement | null;
      const btnLoad = node.querySelector('.load-drawing') as HTMLButtonElement | null;
      const btnDelete = node.querySelector('.delete-drawing') as HTMLButtonElement | null;

      if (!thumb || !name || !meta || !btnLoad || !btnDelete) continue;

      thumb.src = row.thumbnailDataUrl;
      name.textContent = row.name;
      meta.textContent = `${new Date(row.updatedAt).toLocaleTimeString()} - ${row.meta.elementCount} elements`;

      btnLoad.addEventListener('click', () => {
        onLoad(row);
        dom.galleryModal.close();
      });

      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete drawing "${row.name}"?`)) return;
        await deleteDrawing(row.id);
        await renderGallery(dom, onLoad);
      });

      content.appendChild(node);
    }

    details.appendChild(content);
    dom.galleryList.appendChild(details);
  }
}

function getWeekIdentifier(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust to Monday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getWeekLabel(weekId: string): string {
  const monday = new Date(weekId);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const now = new Date();
  const currentWeekId = getWeekIdentifier(now);

  if (weekId === currentWeekId) return 'This Week';

  const lastWeek = new Date(now);
  lastWeek.setDate(now.getDate() - 7);
  if (weekId === getWeekIdentifier(lastWeek)) return 'Last Week';

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  const label = `${monday.toLocaleDateString(undefined, options)} - ${sunday.toLocaleDateString(undefined, options)}`;
  if (monday.getFullYear() !== now.getFullYear()) {
    return `${label}, ${monday.getFullYear()}`;
  }
  return label;
}

export async function saveDrawing(
  elements: SketchElement[],
  viewport: ViewportState,
  mode: ToolMode,
  background: string = 'checkerboard-bg',
  currentRecord?: DrawingRecord
): Promise<DrawingRecord | null> {
  if (elements.length === 0) {
    showMessage('Nothing to save yet.', { type: 'warning', timeoutMs: 2500 });
    return null;
  }

  const nameInput = window.prompt(
    'Version name:',
    currentRecord?.name ?? `Drawing ${new Date().toLocaleString()}`
  );
  if (!nameInput) return null;

  const bounds = getCropBounds(elements);
  const thumbUrl = bounds ? makeThumbnail(elements) : '';

  const now = Date.now();
  const record: DrawingRecord = {
    id: currentRecord?.id ?? crypto.randomUUID(),
    name: nameInput.trim(),
    createdAt: currentRecord?.createdAt ?? now,
    updatedAt: now,
    viewport: { ...viewport },
    elements: elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement),
    thumbnailDataUrl: thumbUrl,
    meta: buildMeta(elements, mode, background),
  };

  try {
    await putDrawing(record);
    showMessage(`Saved version "${record.name}".`, { timeoutMs: 2500 });
    return record;
  } catch (error) {
    console.error('[SketchBoard] Failed to save drawing', error);
    showMessage('Failed to save drawing.', { type: 'alert', timeoutMs: 3000 });
    return null;
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

export async function exportGallery(): Promise<void> {
  try {
    const drawings = await getAllDrawings();
    if (drawings.length === 0) {
      showMessage('Gallery is empty.', { type: 'warning', timeoutMs: 2500 });
      return;
    }

    const data: GalleryExport = {
      version: 1,
      app: 'sketch-board',
      drawings,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `sketch-board-gallery-${new Date().toISOString().split('T')[0]}.json`;
    await downloadFile(blob, filename);

    showMessage(`Exported ${drawings.length} drawings.`, { timeoutMs: 2500 });
  } catch (error) {
    console.error('[SketchBoard] Gallery export failed', error);
    showMessage('Failed to export gallery.', { type: 'alert', timeoutMs: 3000 });
  }
}

export async function importGallery(
  file: File,
  onComplete: () => void | Promise<void>
): Promise<void> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as GalleryExport;

    if (data.app !== 'sketch-board' || !Array.isArray(data.drawings)) {
      throw new Error('Invalid gallery file format');
    }

    let importedCount = 0;
    for (const record of data.drawings) {
      await putDrawing(record);
      importedCount++;
      // Yield to UI every 10 records to keep it responsive
      if (importedCount % 10 === 0) await yieldToUI();
    }

    showMessage(`Successfully imported ${importedCount} drawings.`, { timeoutMs: 3000 });
    await onComplete();
  } catch (error) {
    console.error('[SketchBoard] Gallery import failed', error);
    showMessage('Failed to import gallery. Invalid format.', { type: 'alert', timeoutMs: 3000 });
  }
}
