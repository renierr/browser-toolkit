import { showProgress, hideProgress, showMessage, yieldToUI } from '@js/ui';
import { downloadFile, setupFileDropzone } from '@js/file-utils.ts';
import { blobToImage, imageElToBlob } from '@js/image-utils.ts';
import Sortable from 'sortablejs';
import { addImageToPDFDocument } from '@js/mupdf-utils.ts';
import mupdf from 'mupdf';
import type { SharedFilesPayload } from '@js/share-target';
import { isImageFile } from '@js/utils.ts';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const imageList = document.getElementById('image-list') as HTMLDivElement;
  const actions = document.getElementById('actions') as HTMLDivElement;
  const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;

  let images: ImageItem[] = [];

  const renderImages = () => {
    imageList.innerHTML = '';
    images.forEach((item, index) => {
      const card = document.createElement('div');
      card.className =
        'relative group aspect-square bg-base-200 rounded-lg overflow-hidden border border-base-300 cursor-move touch-none';
      card.dataset.id = item.id;

      card.innerHTML = `
        <img src="${item.previewUrl}" alt="Preview ${index + 1}" class="w-full h-full object-cover pointer-events-none" />
        <button class="btn btn-circle btn-error btn-xs remove-btn absolute top-1 right-1 shadow-sm z-10" data-id="${item.id}">
          &#10005;
        </button>
        <div class="absolute bottom-1 left-1 bg-base-100/80 px-1.5 rounded text-[10px] font-bold">
          ${index + 1}
        </div>
      `;
      imageList.appendChild(card);
    });

    actions.classList.toggle('hidden', images.length === 0);
  };

  // noinspection JSUnusedGlobalSymbols
  const sortable = Sortable.create(imageList, {
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
        const [movedItem] = images.splice(evt.oldIndex, 1);
        images.splice(evt.newIndex, 0, movedItem);
        renderImages();
      }
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const newImages = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      }));

    images = [...images, ...newImages];
    renderImages();
  };

  setupFileDropzone('drop-zone', 'file-input', async (files) => {
    handleFiles(files);
    fileInput.value = '';
  });

  if (payload?.sharedFiles?.length) {
    const files = payload.sharedFiles.filter((f) => isImageFile(f));
    if (files.length > 0) {
      handleFiles(files as unknown as FileList);
    }
  }

  imageList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const removeBtn = target.closest('.remove-btn') as HTMLButtonElement;
    if (removeBtn) {
      const id = removeBtn.dataset.id;
      const index = images.findIndex((img) => img.id === id);
      if (index !== -1) {
        URL.revokeObjectURL(images[index].previewUrl);
        images.splice(index, 1);
        renderImages();
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    images = [];
    renderImages();
  });

  generateBtn.addEventListener('click', async () => {
    if (images.length === 0) return;

    showProgress('Generating PDF...');
    const pdfDoc = new mupdf.PDFDocument();

    try {
      let imgCount = 0;
      for (const item of images) {
        imgCount++;
        const p = Math.round((imgCount / images.length) * 100);
        showProgress(`Processing image ${imgCount} of ${images.length}: ${item.file.name}...`, {
          progress: p,
        });
        await yieldToUI();

        const imageBytes = await item.file.arrayBuffer();
        const imgId = 'Img_' + imgCount++;
        let image;

        try {
          if (
            item.file.type === 'image/jpeg' ||
            item.file.type === 'image/jpg' ||
            item.file.type === 'image/png'
          ) {
            image = imageBytes;
          } else {
            image = await fallbackImageHandling(item);
          }
        } catch (e) {
          image = await fallbackImageHandling(item);
        }

        if (image) {
          addImageToPDFDocument(pdfDoc, imgId, new Uint8Array(image));
        } else {
          console.warn('Failed to embed image', item.file.name);
          showMessage('Failed to embed image ' + item.file.name, {
            type: 'warning',
            timeoutMs: 10000,
          });
        }
      }

      const pdfBytes = pdfDoc.saveToBuffer('compress,compress-images,garbage');
      await downloadFile(pdfBytes.asUint8Array(), `images-${Date.now()}.pdf`, 'application/pdf');

      showMessage('PDF created successfully!', { type: 'info', timeoutMs: 5000 });
    } catch (error) {
      console.error('Failed to generate PDF', error);
      showMessage('Failed to generate PDF. Please try again.', { type: 'alert' });
    } finally {
      pdfDoc.destroy();
      hideProgress();
    }
  });

  return () => {
    sortable.destroy();
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  };
}

const fallbackImageHandling = async (item: ImageItem) => {
  // Fallback for WebP or other formats: use Canvas to convert to JPEG
  const img = await blobToImage(item.file);
  const blob = await imageElToBlob(img, 'image/jpeg', 0.9);
  return await blob.arrayBuffer();
};
