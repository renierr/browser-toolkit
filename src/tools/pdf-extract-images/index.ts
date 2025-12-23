import { downloadAsZip, type DownloadBuffer, setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';

// dynamic importing of large pdf libs to reduce chunk size and loading time
const pdfjsLib = await import('pdfjs-dist');
const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default ?? workerModule;

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    await extractImages(files);
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
    const objs = page.objs;
    if (!objs) {
      throw new Error(`[extract-images] PDF.js page.objs is empty.`);
    }
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (
        ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject ||
        ops.fnArray[i] === pdfjsLib.OPS.paintInlineImageXObject ||
        ops.fnArray[i] === pdfjsLib.OPS.paintXObject
      ) {
        const imgName = ops.argsArray[i][0];
        showProgress(`Extracting images from ${fileName} - Page ${pageNum} - Image ${imgName}...`);
        let img;
        if (typeof objs.get === 'function') {
          img = objs.get(imgName);
        } else {
          img = (objs as any)[imgName];
        }
        if (!img) {
          console.warn(`[extract-images] No image object found: ${imgName} on Page ${pageNum}`);
          continue;
        }
        if (!img.data && img.bitmap instanceof ImageBitmap) {
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
            continue;
          } else {
            console.warn(
              `[extract-images] cannot extract ImageBitmap: ${imgName} on page ${pageNum}`,
              img
            );
            continue;
          }
        }
        if (!img.data) {
          console.warn(
            `[extract-images] image object without data: ${imgName} on page ${pageNum}`,
            img
          );
          continue;
        }
        if (typeof img.width !== 'number' || typeof img.height !== 'number') {
          console.warn(
            `[extract-images] image object without dimension: ${imgName} on page ${pageNum}`,
            img
          );
          continue;
        }
        const imageData =
          img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data.buffer);
        images.push({
          name: `${fileName.replace(/\.pdf$/i, '')}_page${pageNum}_${imgName}.png`,
          data: imageData,
          width: img.width,
          height: img.height,
        });
        // let ui breath
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

    showProgress(`Extracting images from ${files.length} file(s)...`);

    let allImages: Array<{ name: string; data: Uint8Array; width: number; height: number }> = [];
    for (let i = 0; i < fileBuffers.length; i++) {
      const images = await extractImagesFromPDF(fileBuffers[i], fileNames[i]);
      allImages = allImages.concat(images);
    }

    if (allImages.length === 0) {
      showMessage('The PDF file(s) do not contain any images to extract.', { type: 'alert' });
      return;
    }

    renderImages(allImages);
    showMessage(`${allImages.length} image(s) extracted.`, { timeoutMs: 15000 });
  } catch (error) {
    console.error('Error extracting images:', error);
    showMessage(
      error instanceof Error ? error.message : 'error occurred during image extraction.', { type: 'alert' }
    );
  } finally {
    hideProgress();
  }
}

function createImageURL(data: Uint8Array) {
  return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
}

function renderImages(
  images: Array<{ name: string; data: Uint8Array; width: number; height: number }>
) {
  const container = document.getElementById('image-container');
  if (!container) return;

  // revoke previous object URLs
  container.querySelectorAll('img[data-url]').forEach((img) => {
    const u = (img as HTMLImageElement).dataset.url;
    if (u) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
  });

  container.innerHTML = '';

  // header area with Download All button aligned to the right
  const header = document.createElement('div');
  header.className = 'flex items-center justify-end mb-2';

  const downloadAllBtn = document.createElement('button');
  downloadAllBtn.id = 'pdf-download-all';
  downloadAllBtn.className = 'btn btn-primary';
  downloadAllBtn.textContent = `Download all (${images.length})`;
  header.appendChild(downloadAllBtn);

  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4';

  images.forEach((img) => {
    const url = createImageURL(img.data);
    const wrapper = document.createElement('div');
    wrapper.className = 'relative cursor-pointer overflow-hidden rounded';

    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = img.name;
    thumb.dataset.url = url;
    thumb.className = 'object-cover w-full h-32 rounded shadow-sm';
    thumb.title = img.name;

    thumb.addEventListener('click', () => openLightbox(url, img.name));

    // per-image download button
    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = img.name;
    downloadBtn.className = 'absolute top-1 right-1 btn btn-sm';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // allow default download behavior
    });

    wrapper.appendChild(thumb);
    wrapper.appendChild(downloadBtn);
    grid.appendChild(wrapper);
  });

  container.appendChild(grid);

  // attach click handler to Download All button
  downloadAllBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (images.length === 0) return;

    downloadAllBtn.disabled = true;
    const originalText = downloadAllBtn.textContent;
    downloadAllBtn.textContent = 'Preparing ZIP...';
    showProgress('Preparing ZIP archive...');
    try {
      const zipFiles: DownloadBuffer[] = images.map((img) => ({
        name: img.name,
        data: img.data,
      }));
      await downloadAsZip(zipFiles, 'images.zip');
      showMessage(`${images.length} image(s) downloaded as ZIP.`, { timeoutMs: 15000 });
    } catch (err) {
      console.error('Error creating ZIP:', err);
      showMessage('Failed to create ZIP file.', { type: 'alert' });
    } finally {
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = originalText;
      hideProgress();
    }
  });
}

function openLightbox(url: string, name?: string) {
  // avoid duplicate lightbox
  if (document.getElementById('pdf-image-lightbox')) return;
  const overlay = document.createElement('div');
  overlay.id = 'pdf-image-lightbox';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4';
  overlay.innerHTML = `
    <div class="relative">
      <img src="${url}" alt="${name ?? ''}" class="max-h-[90vh] max-w-[90vw] rounded shadow-lg" />
      <button class="absolute top-2 right-14 btn btn-sm" id="pdf-image-lightbox-close">Close</button>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('image-container')?.appendChild(overlay);
  document.getElementById('pdf-image-lightbox-close')?.addEventListener('click', () => overlay.remove());
}
