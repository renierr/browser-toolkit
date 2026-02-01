import { downloadAsZip, type DownloadBuffer, setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';
import mupdf, { Image, type Matrix, PDFPage, type Rect } from 'mupdf';
import { hashUint8Array } from '../../js/utils.ts';

let extractedImages: Array<{ name: string; data: Uint8Array; width: number; height: number; hash: string }> = [];
const seenHashes = new Set<string>();

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    await extractImages(files);
  });

  document.getElementById('clear-btn')?.addEventListener('click', () => {
    extractedImages = [];
    seenHashes.clear();
    renderImages();
  });

  document.getElementById('download-all-btn')?.addEventListener('click', async () => {
    if (extractedImages.length === 0) return;

    const btn = document.getElementById('download-all-btn') as HTMLButtonElement;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.textContent = 'Preparing ZIP...';
    showProgress('Preparing ZIP archive...');

    try {
      const zipFiles: DownloadBuffer[] = extractedImages.map((img) => ({
        name: img.name,
        data: img.data,
      }));
      await downloadAsZip(zipFiles, 'extracted-images.zip');
      showMessage(`${extractedImages.length} image(s) downloaded as ZIP.`, { timeoutMs: 15000 });
    } catch (err) {
      console.error('Error creating ZIP:', err);
      showMessage('Failed to create ZIP file.', { type: 'alert' });
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
      hideProgress();
    }
  });

  return () => {
    extractedImages = [];
    seenHashes.clear();
  }
}

async function extractImagesFromPDF(fileBuffer: ArrayBuffer, fileName: string) {
  const images: Array<{ name: string; data: Uint8Array; width: number; height: number; hash: string }> = [];
  try {
    const doc = mupdf.Document.openDocument(new Uint8Array(fileBuffer));
    const pageCount = doc.countPages();

    const imagePromises: Promise<void>[] = [];

    const processPixmap = (pixmap: any, nameSuffix: string, pageIndex: number) => {
      imagePromises.push(
        (async () => {
          try {
            const pngBytes = pixmap.asPNG();
            const hash = await hashUint8Array(pngBytes);

            if (seenHashes.has(hash)) return; // duplicate -> skip
            seenHashes.add(hash);

            images.push({
              name: `${fileName.replace(/\.pdf$/i, '')}_p${pageIndex + 1}_${nameSuffix}.png`,
              data: pngBytes,
              width: pixmap.getWidth(),
              height: pixmap.getHeight(),
              hash,
            });
          } catch (e) {
            console.warn(`Failed to process image ${nameSuffix}`, e);
          }
        })()
      );
    };

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      showProgress(`Scanning ${fileName} - Page ${pageIndex + 1} of ${pageCount} for embedded images...`);
      await yieldToUI();

      try {
        const page = doc.loadPage(pageIndex) as PDFPage;
        let imageCounter = 0;

        const structure = page.toStructuredText("preserve-images");
        structure.walk({
          onImageBlock: (_bbox: Rect, _transform: Matrix, image: Image) => {
            const pixmap = image.toPixmap();
            processPixmap(pixmap, `img-${imageCounter++}`, pageIndex);
          }
        });

        let annotCounter = 0;
        const matrix = mupdf.Matrix.identity;
        const colorspace = mupdf.ColorSpace.DeviceRGB;

        page.getAnnotations().forEach((annot) => {
          const annotType = annot.getType();
          switch (annotType) {
            case 'Ink':
            case 'Stamp':
              const pixmap = annot.toPixmap(matrix, colorspace, true);
              processPixmap(pixmap, `annot-${annotCounter++}`, pageIndex);
              break;
            default:
              console.debug(`Annotation of type ${annotType} ignored for image extraction`);
          }
        });

      } catch (err) {
        console.warn(`[extract-images] failed for page ${pageIndex + 1}:`, err);
      }
    }

    await Promise.all(imagePromises);

  } catch (err) {
    console.error('[extract-images] Failed to open document:', err);
  }

  return images;
}

export async function extractImages(files : FileList) {
  showProgress('Reading PDF file(s) ...');
  try {
    seenHashes.clear();
    for (const ex of extractedImages) {
      if ((ex as any).hash) seenHashes.add((ex as any).hash);
    }

    const fileBuffers: ArrayBuffer[] = [];
    const fileNames: string[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      fileBuffers.push(buffer);
      fileNames.push(file.name);
    }
    for (let i = 0; i < fileBuffers.length; i++) {
      const images = await extractImagesFromPDF(fileBuffers[i], fileNames[i]);
      extractedImages = extractedImages.concat(images);
    }
    if (extractedImages.length === 0) {
      showMessage('No images found in the PDF(s).', { type: 'warning', timeoutMs: 10000 });
      return;
    }
    renderImages();
  } catch (error) {
    console.error('Error extracting images:', error);
    showMessage('Error occurred during image extraction.', { type: 'alert' });
  } finally {
    hideProgress();
  }
}

function createImageURL(data: Uint8Array) {
  return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
}

function renderImages() {
  const list = document.getElementById('image-list');
  const actions = document.getElementById('actions');
  const downloadBtn = document.getElementById('download-all-btn');
  if (!list || !actions || !downloadBtn) return;

  list.querySelectorAll('img[data-url]').forEach((img) => {
    const u = (img as HTMLImageElement).dataset.url;
    if (u) URL.revokeObjectURL(u);
  });

  list.innerHTML = '';

  if (extractedImages.length === 0) {
    actions.classList.add('hidden');
    return;
  }

  actions.classList.remove('hidden');
  downloadBtn.innerHTML = `<i data-lucide="download" class="w-4 h-4 mr-2"></i> Download All (${extractedImages.length})`;

  extractedImages.forEach((img, index) => {
    const url = createImageURL(img.data);
    const wrapper = document.createElement('div');
    wrapper.className = 'group relative flex flex-col bg-base-200 rounded-lg overflow-hidden border border-base-300';

    const imageContainer = document.createElement('div');
    imageContainer.className = 'w-full max-h-48 aspect-square relative bg-base-200 flex items-center justify-center';

    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = img.name;
    thumb.dataset.url = url;
    thumb.className =
      'checkerboard-bg w-full h-full object-contain transition-transform group-hover:scale-105';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'absolute inset-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset z-10';
    previewBtn.setAttribute('aria-label', `Preview image ${img.name}`);
    previewBtn.onclick = () => openLightbox(url, img.name);

    const actionBar = document.createElement('div');
    actionBar.className = 'w-full flex items-center justify-center gap-2 p-2 bg-base-100/60';

    const downloadSingle = document.createElement('a');
    downloadSingle.href = url;
    downloadSingle.download = img.name;
    downloadSingle.className = 'btn btn-primary btn-xs shadow pointer-events-auto flex items-center gap-1';
    downloadSingle.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i>';
    downloadSingle.setAttribute('aria-label', 'Download image');
    downloadSingle.onclick = (e) => e.stopPropagation();

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-error btn-xs shadow pointer-events-auto flex items-center gap-1';
    removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
    removeBtn.setAttribute('aria-label', 'Remove image');
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      const removed = extractedImages.splice(index, 1)[0];
      if (removed?.hash) seenHashes.delete(removed.hash);
      renderImages();
    };

    actionBar.appendChild(downloadSingle);
    actionBar.appendChild(removeBtn);

    imageContainer.appendChild(thumb);
    imageContainer.appendChild(previewBtn);
    wrapper.appendChild(imageContainer);
    wrapper.appendChild(actionBar);
    list.appendChild(wrapper);
  });

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

function openLightbox(url: string, name: string) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image preview');

  overlay.innerHTML = `
    <div class="relative max-w-full max-h-full flex flex-col items-cente">
      <span class="text-white text-sm font-medium truncate max-w-full mb-1">${name}</span>
      <div class="bg-neutral-200 rounded border border-base-300">
        <img src="${url}" class="checkerboard-bg max-w-full max-h-[85vh] object-contain shadow-2xl border rounded-lg" alt="${name}">
      </div>
      <div class="mt-4 flex gap-4 items-center flex-wrap">
        <a href="${url}" download="${name}" class="btn btn-primary btn-sm">
          <i data-lucide="download" class="w-4 h-4 mr-2"></i> Download
        </a>
        <button id="close-lightbox" class="btn btn-secondary btn-sm">
          <i data-lucide="x" class="w-4 h-4 mr-2"></i> Close
        </button>
      </div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', handleEsc);
  };

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  document.body.appendChild(overlay);
  document.getElementById('close-lightbox')?.addEventListener('click', close);
  document.addEventListener('keydown', handleEsc);

  document.getElementById('close-lightbox')?.focus();

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}
