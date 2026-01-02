import { showProgress, hideProgress, showMessage } from '../../js/ui';
import { iconSvgElement } from '../../js/tool-icons';
import { PDFDocument } from '@cantoo/pdf-lib';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const imageList = document.getElementById('image-list') as HTMLDivElement;
  const actions = document.getElementById('actions') as HTMLDivElement;
  const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const dropIcon = document.getElementById('drop-icon') as HTMLDivElement;
  const generateIcon = document.getElementById('generate-icon') as HTMLSpanElement;

  let images: ImageItem[] = [];
  let draggedItem: HTMLElement | null = null;

  // Icons
  if (dropIcon) dropIcon.appendChild(iconSvgElement('upload-cloud', 'w-full h-full'));
  if (generateIcon) generateIcon.appendChild(iconSvgElement('file-text', 'w-4 h-4 mr-2'));

  const renderImages = () => {
    imageList.innerHTML = '';
    images.forEach((item, index) => {
      const card = document.createElement('div');
      card.className =
        'relative group aspect-square bg-base-200 rounded-lg overflow-hidden border border-base-300 cursor-move transition-all';
      card.draggable = true;
      card.dataset.id = item.id;

      card.innerHTML = `
        <img src="${item.previewUrl}" class="w-full h-full object-cover pointer-events-none" />
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
           <button class="btn btn-circle btn-error btn-sm remove-btn" data-id="${item.id}">
             &#10005;
           </button>
        </div>
        <div class="absolute bottom-1 left-1 bg-base-100/80 px-1.5 rounded text-[10px] font-bold">
          ${index + 1}
        </div>
      `;

      card.addEventListener('dragstart', (e) => {
        draggedItem = card;
        card.classList.add('opacity-50', 'scale-95');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      card.addEventListener('dragend', () => {
        draggedItem = null;
        card.classList.remove('opacity-50', 'scale-95');
        document.querySelectorAll('.drag-over').forEach((el) => {
          el.classList.remove('drag-over', 'border-primary', 'ring-2', 'ring-primary');
        });
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== card) {
          card.classList.add('drag-over', 'border-primary', 'ring-2', 'ring-primary');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over', 'border-primary', 'ring-2', 'ring-primary');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over', 'border-primary', 'ring-2', 'ring-primary');
        if (draggedItem && draggedItem !== card) {
          const fromId = draggedItem.dataset.id;
          const toId = card.dataset.id;

          const fromIndex = images.findIndex((img) => img.id === fromId);
          const toIndex = images.findIndex((img) => img.id === toId);

          const [moved] = images.splice(fromIndex, 1);
          images.splice(toIndex, 0, moved);
          renderImages();
        }
      });

      imageList.appendChild(card);
    });

    actions.classList.toggle('hidden', images.length === 0);
  };

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

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-primary', 'bg-primary/5');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-primary', 'bg-primary/5');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-primary', 'bg-primary/5');
    handleFiles(e.dataTransfer?.files || null);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
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
        const imageBytes = await item.file.arrayBuffer();
        let image;

        try {
          if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') {
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (item.file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            throw new Error('Unsupported format for direct embedding');
          }
        } catch (e) {
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
          image = await pdfDoc.embedJpg(blob);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `images-${Date.now()}.pdf`;
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showMessage('PDF created successfully!', { type: 'info' });
    } catch (error) {
      console.error('Failed to generate PDF', error);
      showMessage('Failed to generate PDF. Please try again.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  return () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  };
}
