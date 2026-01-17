import { downloadAsZip, type DownloadBuffer, setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';

// dynamic importing of large pdf libs to reduce chunk size and loading time
const pdfjsLib = await import('pdfjs-dist');
const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default ?? workerModule;

let extractedImages: Array<{ name: string; data: Uint8Array; width: number; height: number }> = [];

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    await extractImages(files);
  });

  document.getElementById('clear-btn')?.addEventListener('click', () => {
    extractedImages = [];
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
}

async function extractImagesFromPDF(fileBuffer: ArrayBuffer, fileName: string) {
  const images: Array<{ name: string; data: Uint8Array; width: number; height: number }> = [];
  const loadingTask = pdfjsLib.getDocument({ data: fileBuffer });
  const pdf = await loadingTask.promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const ops = await page.getOperatorList();

    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    await page.render({
      canvas: canvas,
      canvasContext: ctx!,
      viewport,
    }).promise;

    const processedNames = new Set<string>();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      if (
        fn === pdfjsLib.OPS.paintImageXObject ||
        fn === pdfjsLib.OPS.paintInlineImageXObject ||
        fn === pdfjsLib.OPS.paintXObject
      ) {
        let img: any;
        let imgName: string;

        if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
          img = args[0];
          imgName = `inline_${pageNum}_${i}`;
        } else {
          imgName = args[0];
          if (processedNames.has(imgName)) continue;
          processedNames.add(imgName);

          try {
            img = (page as any).objs.get(imgName);
          } catch (e) {
            try {
              img = (page as any).commonObjs.get(imgName);
            } catch (e2) {
              continue;
            }
          }
        }

        if (!img || typeof img.width !== 'number' || typeof img.height !== 'number') {
          continue;
        }

        showProgress(`Extracting images from ${fileName} - Page ${pageNum}...`);

        try {
          if (img.bitmap instanceof ImageBitmap) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx?.drawImage(img.bitmap, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
              tempCanvas.toBlob(resolve, 'image/png')
            );
            if (blob) {
              images.push({
                name: `${fileName.replace(/\.pdf$/i, '')}_page${pageNum}_${imgName}.png`,
                data: new Uint8Array(await blob.arrayBuffer()),
                width: img.width,
                height: img.height,
              });
            }
          } else if (img.data) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              const imageData = tempCtx.createImageData(img.width, img.height);
              const data = img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data.buffer);

              if (data.length === img.width * img.height * 3) {
                for (let j = 0, k = 0; j < data.length; j += 3, k += 4) {
                  imageData.data[k] = data[j];
                  imageData.data[k + 1] = data[j + 1];
                  imageData.data[k + 2] = data[j + 2];
                  imageData.data[k + 3] = 255;
                }
              } else if (data.length === img.width * img.height * 4) {
                imageData.data.set(data);
              } else {
                continue;
              }

              tempCtx.putImageData(imageData, 0, 0);
              const blob = await new Promise<Blob | null>((resolve) =>
                tempCanvas.toBlob(resolve, 'image/png')
              );
              if (blob) {
                images.push({
                  name: `${fileName.replace(/\.pdf$/i, '')}_page${pageNum}_${imgName}.png`,
                  data: new Uint8Array(await blob.arrayBuffer()),
                  width: img.width,
                  height: img.height,
                });
              }
            }
          }
        } catch (err) {
          console.error(`[extract-images] Error processing image ${imgName} on page ${pageNum}:`, err);
        }
        await yieldToUI();
      }
    }
  }
  return images;
}

export async function extractImages(files : FileList) {
  showProgress('Reading PDF file(s) ...');
  try {
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
      showMessage('No images found in the PDF(s).', { type: 'alert' });
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
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.className = 'group relative aspect-square bg-base-200 rounded-lg overflow-hidden border border-base-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';
    wrapper.onclick = () => openLightbox(url, img.name);
    wrapper.setAttribute('aria-label', `Preview image ${img.name}`);

    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = img.name;
    thumb.dataset.url = url;
    thumb.className = 'w-full h-full object-contain transition-transform group-hover:scale-105';

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2';
    overlay.classList.add('max-lg:opacity-100', 'max-lg:bg-transparent', 'max-lg:items-end', 'max-lg:justify-end');

    const downloadSingle = document.createElement('a');
    downloadSingle.href = url;
    downloadSingle.download = img.name;
    downloadSingle.className = 'btn btn-circle btn-sm btn-primary shadow-lg';
    downloadSingle.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i>';
    downloadSingle.setAttribute('aria-label', 'Download image');
    downloadSingle.onclick = (e) => e.stopPropagation();

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-circle btn-sm btn-error shadow-lg';
    removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
    removeBtn.setAttribute('aria-label', 'Remove image');
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      extractedImages.splice(index, 1);
      renderImages();
    };

    overlay.appendChild(downloadSingle);
    overlay.appendChild(removeBtn);
    wrapper.appendChild(thumb);
    wrapper.appendChild(overlay);
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
    <div class="relative max-w-full max-h-full flex flex-col items-center">
      <img src="${url}" class="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg" alt="${name}">
      <div class="mt-4 flex gap-4 items-center">
        <span class="text-white text-sm font-medium truncate max-w-[200px]">${name}</span>
        <a href="${url}" download="${name}" class="btn btn-primary btn-sm">
          <i data-lucide="download" class="w-4 h-4 mr-2"></i> Download
        </a>
        <button id="close-lightbox" class="btn btn-ghost btn-sm text-white">
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
  
  // Focus the close button for accessibility
  document.getElementById('close-lightbox')?.focus();

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}
