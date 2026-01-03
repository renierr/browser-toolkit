import { showProgress, hideProgress, showMessage, yieldToUI } from '../../js/ui';
import { PDFDocument } from '@cantoo/pdf-lib';
import { downloadFile, setupFileDropzone } from '../../js/file-utils.ts';
import Sortable from 'sortablejs';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
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
    try {
      const pdfDoc = await PDFDocument.create();

      for (const item of images) {
        showProgress('Processing image ' + item.file.name + '...');
        await yieldToUI();

        const imageBytes = await item.file.arrayBuffer();
        let image;

        try {
          if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') {
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (item.file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            image = await fallbackImageHandling(pdfDoc, item);
          }
        } catch (e) {
          image = await fallbackImageHandling(pdfDoc, item);
        }

        if (image) {
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });
        } else {
          console.warn('Failed to embed image', item.file.name);
          showMessage('Failed to embed image ' + item.file.name, {
            type: 'warning',
            timeoutMs: 10000,
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      await downloadFile(pdfBytes, `images-${Date.now()}.pdf`, 'application/pdf');

      showMessage('PDF created successfully!', { type: 'info', timeoutMs: 5000 });
    } catch (error) {
      console.error('Failed to generate PDF', error);
      showMessage('Failed to generate PDF. Please try again.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  return () => {
    sortable.destroy();
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  };
}

const fallbackImageHandling = async (pdfDoc: PDFDocument, item: ImageItem) => {
  // Fallback for WebP or other formats: use Canvas to convert to JPEG
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = item.previewUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const response = await fetch(dataUrl);
  const blob = await response.arrayBuffer();
  return await pdfDoc.embedJpg(blob);
};
