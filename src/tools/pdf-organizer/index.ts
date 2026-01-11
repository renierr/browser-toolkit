import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { showProgress, hideProgress, showMessage, yieldToUI } from '../../js/ui.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import Sortable from 'sortablejs';

// Dynamic import for pdfjs to render thumbnails
const pdfjsLib = await import('pdfjs-dist');
const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default ?? workerModule;

interface PageItem {
  id: string;
  originalIndex: number;
  thumbnailUrl: string;
  selected: boolean;
}

export default function init() {
  const pageList = document.getElementById('page-list') as HTMLDivElement;
  const actions = document.getElementById('organizer-actions') as HTMLDivElement;
  const dropzone = document.getElementById('pdf-dropzone') as HTMLDivElement;
  const selectionCount = document.getElementById('selection-count') as HTMLSpanElement;

  const removeBtn = document.getElementById('remove-selected-btn') as HTMLButtonElement;
  const duplicateBtn = document.getElementById('duplicate-selected-btn') as HTMLButtonElement;
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const selectAllBtn = document.getElementById('select-all-btn') as HTMLButtonElement;
  const deselectAllBtn = document.getElementById('deselect-all-btn') as HTMLButtonElement;

  let pages: PageItem[] = [];
  let originalPdfBytes: ArrayBuffer | null = null;

  const updateUI = () => {
    const selectedCount = pages.filter(p => p.selected).length;
    selectionCount.textContent = `${selectedCount} pages selected`;
    removeBtn.disabled = selectedCount === 0;
    duplicateBtn.disabled = selectedCount === 0;

    renderPages();
  };

  const renderPages = () => {
    pageList.innerHTML = '';
    pages.forEach((page, index) => {
      const card = document.createElement('div');
      card.className = `relative group aspect-[3/4] bg-base-100 rounded-lg overflow-hidden border-2 transition-all cursor-move touch-none ${
        page.selected ? 'border-primary ring-2 ring-primary/20' : 'border-base-300 hover:border-base-content/30'
      }`;
      card.dataset.id = page.id;

      card.innerHTML = `
        <img src="${page.thumbnailUrl}" class="w-full h-full object-contain pointer-events-none bg-white" />
        <div class="absolute top-2 left-2 z-10">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-sm page-checkbox shadow-sm bg-base-100 border-base-content/30" ${page.selected ? 'checked' : ''} data-id="${page.id}" />
        </div>
        <div class="absolute bottom-2 right-2 bg-base-300/90 px-1.5 rounded text-[10px] font-bold z-10">
          ${index + 1}
        </div>
        <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"></div>
      `;

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('page-checkbox')) return;
        page.selected = !page.selected;
        updateUI();
      });

      const checkbox = card.querySelector('.page-checkbox') as HTMLInputElement;
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        page.selected = checkbox.checked;
        updateUI();
      });

      pageList.appendChild(card);
    });
  };

  const sortable = Sortable.create(pageList, {
    animation: 150,
    ghostClass: 'opacity-20',
    onEnd: (evt) => {
      if (evt.oldIndex !== undefined && evt.newIndex !== undefined && evt.oldIndex !== evt.newIndex) {
        const [movedItem] = pages.splice(evt.oldIndex, 1);
        pages.splice(evt.newIndex, 0, movedItem);
        renderPages();
      }
    },
  });

  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    if (files.length === 0) return;
    showProgress('Loading PDF...');

    try {
      originalPdfBytes = await files[0].arrayBuffer();
      // Use a copy for pdfjsLib to prevent detaching the original buffer when transferred to worker
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(originalPdfBytes.slice(0)) });
      const pdf = await loadingTask.promise;

      pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        showProgress(`Rendering page ${i}/${pdf.numPages}...`);
        await yieldToUI();
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.8 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        pages.push({
          id: Math.random().toString(36).substring(2, 9),
          originalIndex: i - 1,
          thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8),
          selected: false
        });
      }

      dropzone.classList.add('hidden');
      actions.classList.remove('hidden');
      updateUI();
      showMessage(`Loaded ${pdf.numPages} pages.`, { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('Failed to load PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  removeBtn.addEventListener('click', () => {
    pages = pages.filter(p => !p.selected);
    updateUI();
  });

  duplicateBtn.addEventListener('click', () => {
    const newPages: PageItem[] = [];
    pages.forEach(p => {
      newPages.push(p);
      if (p.selected) {
        newPages.push({ ...p, id: Math.random().toString(36).substring(2, 9), selected: false });
      }
    });
    pages = newPages;
    updateUI();
  });

  selectAllBtn.addEventListener('click', () => {
    pages.forEach(p => p.selected = true);
    updateUI();
  });

  deselectAllBtn.addEventListener('click', () => {
    pages.forEach(p => p.selected = false);
    updateUI();
  });

  downloadBtn.addEventListener('click', async () => {
    if (pages.length === 0 || !originalPdfBytes) return;
    showProgress('Generating PDF...');

    try {
      const srcDoc = await PDFDocument.load(originalPdfBytes);
      const outDoc = await PDFDocument.create();

      for (const pageItem of pages) {
        const [copiedPage] = await outDoc.copyPages(srcDoc, [pageItem.originalIndex]);
        outDoc.addPage(copiedPage);
        await yieldToUI();
      }

      const pdfBytes = await outDoc.save();
      await downloadFile(pdfBytes, `organized-${Date.now()}.pdf`, 'application/pdf');
      showMessage('PDF downloaded successfully.');
    } catch (err) {
      console.error(err);
      showMessage('Failed to generate PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  return () => {
    sortable.destroy();
  };
}
