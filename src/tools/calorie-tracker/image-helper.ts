import { createBitmapWithLimit } from '@js/image-utils';
import { showMessage } from '@js/ui';

/**
 * Resizes an image Blob to keep its aspect ratio with a max dimension of 800px.
 * Converts to a lightweight JPEG (0.8 quality) to optimize storage and network speed.
 */
export async function resizeImage(blob: Blob, maxDim = 800): Promise<Blob> {
  try {
    const bitmap = await createBitmapWithLimit(blob, maxDim);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return blob;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    canvas.width = 0;
    canvas.height = 0;

    return jpegBlob || blob;
  } catch (err) {
    console.warn('[Calorie Tracker] Image resize failed, using original:', err);
    return blob;
  }
}

export type ImageIntakeElements = {
  mealDropzone: HTMLDivElement;
  dropzonePrompt: HTMLDivElement;
  dropzonePreview: HTMLImageElement;
  fileInput: HTMLInputElement;
  pasteBtn: HTMLButtonElement;
  clearImageBtn: HTMLButtonElement;
  analyzeBtn: HTMLButtonElement;
};

export type ImageIntakeCallbacks = {
  onImageChanged: (blob: Blob | null) => void;
};

/**
 * Attaches drag-and-drop, file input, and clipboard paste listeners.
 * Employs aspect-preserving 800px downscaling.
 * Returns a cleanup function for attached global/local event listeners.
 */
export function setupImageIntake(
  elements: ImageIntakeElements,
  callbacks: ImageIntakeCallbacks
) {
  const {
    mealDropzone,
    dropzonePrompt,
    dropzonePreview,
    fileInput,
    pasteBtn,
    clearImageBtn,
    analyzeBtn,
  } = elements;

  const handleImageBlob = async (blob: Blob) => {
    if (!blob.type.startsWith('image/')) {
      showMessage('Only image uploads are supported.', { type: 'alert' });
      return;
    }

    // Downscale and compress
    const resized = await resizeImage(blob, 800);
    const objectUrl = URL.createObjectURL(resized);

    dropzonePreview.src = objectUrl;
    dropzonePreview.classList.remove('hidden');
    dropzonePrompt.classList.add('hidden');
    clearImageBtn.classList.remove('hidden');
    analyzeBtn.disabled = false;

    callbacks.onImageChanged(resized);
  };

  const clearImage = () => {
    dropzonePreview.src = '';
    dropzonePreview.classList.add('hidden');
    dropzonePrompt.classList.remove('hidden');
    clearImageBtn.classList.add('hidden');
    analyzeBtn.disabled = true;
    fileInput.value = '';
    callbacks.onImageChanged(null);
  };

  const onFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void handleImageBlob(file);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    mealDropzone.classList.add('border-primary');
  };

  const onDragLeave = () => {
    mealDropzone.classList.remove('border-primary');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    mealDropzone.classList.remove('border-primary');
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleImageBlob(file);
  };

  const onPaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          void handleImageBlob(file);
          showMessage('Meal image pasted from clipboard!', { type: 'info', timeoutMs: 2000 });
          break;
        }
      }
    }
  };

  const triggerPaste = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            void handleImageBlob(blob);
            showMessage('Meal image read from clipboard!', { type: 'info', timeoutMs: 2000 });
            return;
          }
        }
      }
      showMessage('No image found in clipboard. Please copy an image first.', { type: 'alert' });
    } catch (err) {
      console.error('[Calorie Tracker] Clipboard access failed:', err);
      showMessage('Clipboard paste failed. Try standard Ctrl+V on the page.', { type: 'alert' });
    }
  };

  // Bind Listeners
  const onDropzoneClick = (e: MouseEvent) => {
    if (e.target === clearImageBtn || clearImageBtn.contains(e.target as Node)) return;
    fileInput.click();
  };

  mealDropzone.addEventListener('click', onDropzoneClick);
  fileInput.addEventListener('change', onFileChange);
  mealDropzone.addEventListener('dragover', onDragOver);
  mealDropzone.addEventListener('dragleave', onDragLeave);
  mealDropzone.addEventListener('drop', onDrop);
  pasteBtn.addEventListener('click', triggerPaste);
  clearImageBtn.addEventListener('click', clearImage);
  window.addEventListener('paste', onPaste);

  return {
    clearImage,
    handleImageBlob,
    cleanup: () => {
      mealDropzone.removeEventListener('click', onDropzoneClick);
      fileInput.removeEventListener('change', onFileChange);
      mealDropzone.removeEventListener('dragover', onDragOver);
      mealDropzone.removeEventListener('dragleave', onDragLeave);
      mealDropzone.removeEventListener('drop', onDrop);
      pasteBtn.removeEventListener('click', triggerPaste);
      clearImageBtn.removeEventListener('click', clearImage);
      window.removeEventListener('paste', onPaste);
    },
  };
}
