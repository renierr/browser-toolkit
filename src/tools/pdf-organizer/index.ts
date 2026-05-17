import { setupFileDropzone, downloadFile } from '@js/file-utils.ts';
import { showProgress, hideProgress, showMessage, yieldToUI } from '@js/ui.ts';
import mupdf, { type PDFDocument, type Document } from 'mupdf';
import Sortable from 'sortablejs';
import type { ToolPayload } from '@js/types';
import { openInTool } from '@js/tool-chooser.ts';

interface PageItem {
  id: string;
  pdf: number;
  originalIndex: number;
  thumbnailUrl: string;
  selected: boolean;
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: ToolPayload) {
  const pageList = document.getElementById('page-list') as HTMLDivElement;
  const actions = document.getElementById('organizer-actions') as HTMLDivElement;
  const dropzone = document.getElementById('pdf-dropzone') as HTMLDivElement;
  const selectionCount = document.getElementById('selection-count') as HTMLSpanElement;
  const loadedFilename = document.getElementById('loaded-filename') as HTMLHeadingElement;

  const removeBtn = document.getElementById('remove-selected-btn') as HTMLButtonElement;
  const duplicateBtn = document.getElementById('duplicate-selected-btn') as HTMLButtonElement;
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const downloadSelectedBtn = document.getElementById('download-selected-btn') as HTMLButtonElement;
  const openViewerBtn = document.getElementById('open-viewer-btn') as HTMLButtonElement;
  const selectAllBtn = document.getElementById('select-all-btn') as HTMLButtonElement;
  const deselectAllBtn = document.getElementById('deselect-all-btn') as HTMLButtonElement;
  const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
  const startOverBtn = document.getElementById('start-over-btn') as HTMLButtonElement;
  const addFileBtn = document.getElementById('add-file-btn') as HTMLButtonElement;
  const addPdfFileInput = document.getElementById('add-pdf-file') as HTMLInputElement;

  let pages: PageItem[] = [];
  let history: PageItem[][] = [];
  let originalPdfBytes: Uint8Array<ArrayBufferLike>[] = [];
  let originalFileName: string[] = [];

  const generateId = () => crypto.randomUUID();

  const pushHistory = () => {
    history.push(pages.map((p) => ({ ...p })));
    if (history.length > 20) history.shift();
  };

  const revokeThumbnails = (list: PageItem[]) => {
    for (const p of list) {
      try {
        if (p.thumbnailUrl && p.thumbnailUrl.startsWith('blob:'))
          URL.revokeObjectURL(p.thumbnailUrl);
      } catch {}
    }
  };

  const updateUI = () => {
    const selectedCount = pages.filter((p) => p.selected).length;
    selectionCount.textContent = `${selectedCount} pages selected`;
    removeBtn.disabled = selectedCount === 0;
    duplicateBtn.disabled = selectedCount === 0;
    downloadSelectedBtn.disabled = selectedCount === 0;
    undoBtn.disabled = history.length === 0;

    if (originalFileName.length > 0) {
      if (originalFileName.length === 1) {
        loadedFilename.textContent = originalFileName[0];
      } else {
        loadedFilename.textContent = `${originalFileName.length} files loaded`;
      }
    } else {
      loadedFilename.textContent = '';
    }

    renderPages();
  };

  const renderPages = () => {
    pageList.innerHTML = '';
    pages.forEach((page, index) => {
      const card = document.createElement('div');
      card.className = `relative group aspect-[3/4] bg-base-100 rounded-lg overflow-hidden border-2 cursor-move touch-none ${
        page.selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-base-300 hover:border-base-content/30'
      }`;
      card.dataset.id = page.id;

      card.innerHTML = `
        <img src="${page.thumbnailUrl}" class="w-full h-full object-contain pointer-events-none bg-white" alt="Page ${index + 1}" />
        <div class="absolute top-2 left-2 z-10">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-sm page-checkbox shadow-sm bg-base-100 border-base-content/30 pointer-events-none" ${page.selected ? 'checked' : ''} />
        </div>
        <div class="absolute bottom-2 right-2 bg-base-300/90 px-1.5 rounded text-[10px] font-bold z-10">
          ${index + 1}
        </div>
        <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"></div>
      `;

      pageList.appendChild(card);
    });
  };

  const sortable = Sortable.create(pageList, {
    animation: 150,
    ghostClass: 'opacity-20',
    chosenClass: 'scale-95',
    dragClass: 'ring-2',
    onEnd: (evt) => {
      if (
        evt.oldIndex !== undefined &&
        evt.newIndex !== undefined &&
        evt.oldIndex !== evt.newIndex
      ) {
        pushHistory();
        const [movedItem] = pages.splice(evt.oldIndex, 1);
        pages.splice(evt.newIndex, 0, movedItem);
        updateUI();
      }
    },
  });

  pageList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('[data-id]') as HTMLElement;
    if (card) {
      const id = card.dataset.id;
      const page = pages.find((p) => p.id === id);
      if (page) {
        page.selected = !page.selected;
        updateUI();
      }
    }
  });

  const loadFiles = async (files: FileList | File[], append = false) => {
    if (files.length === 0) {
      return;
    }
    showProgress('Loading PDF...');

    try {
      let startIndex = 0;
      if (!append) {
        revokeThumbnails(pages);
        pages = [];
        history = [];
        originalPdfBytes = [];
        originalFileName = [];
      } else {
        pushHistory();
        startIndex = originalPdfBytes.length;
      }

      for (let k = 0; k < files.length; k++) {
        const file = files[k];
        showProgress(`Loading file ${k + 1} of ${files.length}: ${file.name}`);
        await yieldToUI();

        const pdfIndex = startIndex + k;
        originalPdfBytes[pdfIndex] = new Uint8Array<ArrayBuffer>(await file.arrayBuffer());
        originalFileName[pdfIndex] = file.name;

        const srcDoc = mupdf.Document.openDocument(originalPdfBytes[pdfIndex]);
        const pageCount = srcDoc.countPages();

        for (let i = 0; i < pageCount; i++) {
          const pageProgress = Math.round(((i + 1) / pageCount) * 100);
          showProgress(`Loading page ${i + 1} of ${pageCount}...`, { progress: pageProgress });
          await yieldToUI();

          const page = srcDoc.loadPage(i);
          const scale = 0.8;
          const matrix = mupdf.Matrix.scale(scale, scale);
          const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
          const jpegBytes = new Uint8Array(pixmap.asJPEG(80));
          const blob = new Blob([jpegBytes.buffer as ArrayBuffer], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);

          pixmap.destroy();
          page.destroy();

          pages.push({
            id: generateId(),
            pdf: pdfIndex,
            originalIndex: i,
            thumbnailUrl: url,
            selected: false,
          });
        }
        srcDoc.destroy();
      }

      dropzone.classList.add('hidden');
      actions.classList.remove('hidden');
      updateUI();
      showMessage(`Loaded ${pages.length} pages.`, { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('Failed to load PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  };

  setupFileDropzone('pdf-dropzone', 'pdf-file', loadFiles);

  if (payload?.sharedFiles?.length) {
    const pdfFiles = payload.sharedFiles.filter(
      (f) => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length > 0) {
      loadFiles(pdfFiles as unknown as FileList);
    }
  }

  addFileBtn.addEventListener('click', () => {
    addPdfFileInput.click();
  });

  addPdfFileInput.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      loadFiles(files, true);
      addPdfFileInput.value = '';
    }
  });

  removeBtn.addEventListener('click', () => {
    pushHistory();
    pages = pages.filter((p) => !p.selected);
    updateUI();
  });

  duplicateBtn.addEventListener('click', () => {
    pushHistory();
    const newPages: PageItem[] = [];
    pages.forEach((p) => {
      newPages.push(p);
      if (p.selected) {
        newPages.push({ ...p, id: generateId(), selected: false });
      }
    });
    pages = newPages;
    updateUI();
  });

  undoBtn.addEventListener('click', () => {
    const previousState = history.pop();
    if (previousState) {
      pages = previousState;
      updateUI();
    }
  });

  startOverBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to start over? All changes will be lost.')) {
      revokeThumbnails(pages);
      pages = [];
      history = [];
      originalPdfBytes = [];
      originalFileName = [];
      dropzone.classList.remove('hidden');
      actions.classList.add('hidden');
      pageList.innerHTML = '';
      loadedFilename.textContent = '';
      const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  });

  selectAllBtn.addEventListener('click', () => {
    pages.forEach((p) => (p.selected = true));
    updateUI();
  });

  deselectAllBtn.addEventListener('click', () => {
    pages.forEach((p) => (p.selected = false));
    updateUI();
  });

  const generatePdfBytes = async (pagesToDownload: PageItem[]) => {
    if (pagesToDownload.length === 0 || !originalPdfBytes) return null;
    showProgress('Generating PDF...');

    const loadedDocs: Document[] = [];
    let outDoc: PDFDocument | null = null;
    try {
      outDoc = new mupdf.PDFDocument();

      for (let i = 0; i < pagesToDownload.length; i++) {
        const pageItem = pagesToDownload[i];
        const assemblyProgress = Math.round(((i + 1) / pagesToDownload.length) * 100);
        showProgress(`Assembling page ${i + 1} of ${pagesToDownload.length}...`, {
          progress: assemblyProgress,
        });

        let srcDoc;
        if (loadedDocs[pageItem.pdf] === undefined) {
          srcDoc = mupdf.Document.openDocument(originalPdfBytes[pageItem.pdf]);
          loadedDocs[pageItem.pdf] = srcDoc;
        } else {
          srcDoc = loadedDocs[pageItem.pdf];
        }
        const graftMap = outDoc.newGraftMap();
        let insertAt: number = outDoc.countPages();
        graftMap.graftPage(insertAt, srcDoc as PDFDocument, pageItem.originalIndex);
        graftMap.destroy();
        await yieldToUI();
      }

      const buf = outDoc.saveToBuffer(); // mupdf.Buffer
      const ret = new Uint8Array(buf.asUint8Array());
      buf.destroy();
      return ret;
    } catch (err) {
      console.error(err);
      showMessage('Failed to generate PDF.', { type: 'alert' });
      return null;
    } finally {
      outDoc?.destroy();
      loadedDocs.forEach((doc) => doc?.destroy());
      hideProgress();
    }
  };

  downloadBtn.addEventListener('click', async () => {
    const pdfBytes = await generatePdfBytes(pages);
    if (pdfBytes) {
      const fileName = originalFileName[0].replace(/\.pdf$/i, '') + '_organized.pdf';
      await downloadFile(pdfBytes, fileName, 'application/pdf');
      showMessage('PDF downloaded successfully.', { timeoutMs: 5000 });
    }
  });

  downloadSelectedBtn.addEventListener('click', async () => {
    const pdfBytes = await generatePdfBytes(pages.filter((p) => p.selected));
    if (pdfBytes) {
      const fileName = originalFileName[0].replace(/\.pdf$/i, '') + '_selected.pdf';
      await downloadFile(pdfBytes, fileName, 'application/pdf');
      showMessage('PDF downloaded successfully.', { timeoutMs: 5000 });
    }
  });

  openViewerBtn.addEventListener('click', async () => {
    const pdfBytes = await generatePdfBytes(pages);
    if (pdfBytes) {
      const name = originalFileName[0].replace(/\.pdf$/i, '') + '_organized.pdf';
      await openInTool(pdfBytes, { filename: name, mimeType: 'application/pdf' });
    }
  });

  return () => {
    sortable.destroy();
    revokeThumbnails(pages);
    pages = [];
    history = [];
  };
}
