import ExifReader from 'exifreader';
import { setupFileDropzone, downloadFile } from '../../js/file-utils';
import { showMessage } from '../../js/ui';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const resultContainer = document.getElementById('result-container');
  const previewImg = document.getElementById('preview-img') as HTMLImageElement;
  const exifTableBody = document.getElementById('exif-data');
  const downloadBtn = document.getElementById('download-clean') as HTMLButtonElement;

  let currentFile: File | null = null;

  const processFile = async (file: File) => {
    currentFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target?.result as string;
      resultContainer?.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    // Read EXIF
    try {
      const tags = await ExifReader.load(file);
      if (exifTableBody) {
        exifTableBody.innerHTML = '';

        let foundAny = false;
        for (const [key, tag] of Object.entries(tags)) {
          // Filter out some very verbose or binary tags for display
          if (tag.description && typeof tag.description === 'string' && tag.description.length < 200) {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td class="font-mono text-xs">${key}</td>
              <td class="text-xs">${tag.description}</td>
            `;
            exifTableBody.appendChild(row);
            foundAny = true;
          }
        }

        if (!foundAny) {
          exifTableBody.innerHTML = '<tr><td colspan="2" class="text-center italic">No EXIF data found</td></tr>';
        }
      }
    } catch (error) {
      console.error('Error reading EXIF:', error);
      showMessage('Could not read EXIF data.', { type: 'alert' });
    }
  };

  setupFileDropzone('dropzone', 'image-input', (files) => {
    if (files.length > 0) {
      processFile(files[0]);
    }
  });

  downloadBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    try {
      // To strip EXIF without heavy dependencies, we draw to a canvas and export
      const img = new Image();
      img.src = URL.createObjectURL(currentFile);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      ctx.drawImage(img, 0, 0);

      // canvas.toBlob strips EXIF data
      canvas.toBlob((blob) => {
        if (blob) {
          const fileName = currentFile!.name.replace(/\.[^/.]+$/, "") + "_clean.jpg";
          downloadFile(blob, fileName, 'image/jpeg');
          showMessage('Image saved without EXIF data.', { type: 'info', timeoutMs: 5000 });
        }
        URL.revokeObjectURL(img.src);
      }, 'image/jpeg', 0.9);

    } catch (error) {
      console.error('Error stripping EXIF:', error);
      showMessage('Failed to strip EXIF data.', { type: 'alert' });
    }
  });
}
