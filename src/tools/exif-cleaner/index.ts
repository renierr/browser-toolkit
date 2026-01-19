import ExifReader from 'exifreader';
import {
  setupFileDropzone,
  downloadFile,
  downloadAsZip,
  type DownloadBuffer,
} from '../../js/file-utils';
import { showMessage } from '../../js/ui';
import {
  gpsFormatParsedCoordinate,
  gpsParseCoordinateFromExifTags,
  gpsGenerateGoogleMapsLink,
  isImageFile,
} from '../../js/utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const resultContainer = document.getElementById('result-container');
  const previewImg = document.getElementById('preview-img') as HTMLImageElement;
  const exifTableBody = document.getElementById('exif-data');
  const downloadBtn = document.getElementById('download-clean') as HTMLButtonElement;
  const downloadSelectedBtn = document.getElementById('download-selected') as HTMLButtonElement;
  const fileListContainer = document.getElementById('file-list');
  const resultTitle = document.getElementById('result-title');
  const downloadText = document.getElementById('download-text');
  const gpsContainer = document.getElementById('gps-container');
  const gpsLink = document.getElementById('gps-link') as HTMLAnchorElement;

  let currentFiles: File[] = [];
  let selectedIndex = 0;

  const passthroughFile = async (file: File): Promise<DownloadBuffer> => ({
    data: await file.arrayBuffer(),
    name: file.name,
  });

  const updatePreview = async (index: number) => {
    if (index < 0 || index >= currentFiles.length) return;
    selectedIndex = index;
    const file = currentFiles[index];

    // Update active state in list
    fileListContainer?.querySelectorAll('.file-item').forEach((el, i) => {
      if (i === index) {
        el.classList.add('bg-primary', 'text-primary-content');
        el.classList.remove('bg-base-200');
      } else {
        el.classList.remove('bg-primary', 'text-primary-content');
        el.classList.add('bg-base-200');
      }
    });

    // If the file is not an image, avoid image/canvas/Exif work and show a message instead
    if (!isImageFile(file)) {
      // hide or clear image preview
      if (previewImg) {
        previewImg.src = '';
        previewImg.removeAttribute('alt');
      }

      if (exifTableBody) {
        exifTableBody.innerHTML =
          '<tr><td colspan="2" class="text-center italic">Selected file is not an image — no EXIF data available</td></tr>';
      }

      gpsContainer?.classList.add('hidden');

      return;
    }

    // Show preview for images
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);

    // Read EXIF
    try {
      const tags = await ExifReader.load(file);
      if (exifTableBody) {
        exifTableBody.innerHTML = '';

        let foundAny = false;
        const sortedEntries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b));
        for (const [key, tag] of sortedEntries) {
          // Build a display description; for GPS coords we show the parsed decimal value too
          let description = tag.description?.toString();

          if (key === 'GPSLatitude' || key === 'GPSLongitude') {
            const parsed = gpsFormatParsedCoordinate(
              tags[key as 'GPSLatitude' | 'GPSLongitude'],
              tags[key === 'GPSLatitude' ? 'GPSLatitudeRef' : 'GPSLongitudeRef'],
              key === 'GPSLatitude'
            );
            if (parsed) {
              description = parsed + (description ? ` — ${description}` : '');
            } else if (!description && tags[key]?.value) {
              // fallback to stringify the value array/object
              description = String(tags[key].value ?? tags[key]);
            }
          }

          if (description) {
            const row = document.createElement('tr');
            row.className = 'block md:table-row';
            row.innerHTML = `
              <td class="block md:table-cell font-mono text-xs font-bold py-2 md:py-0">
                <div class="md:px-2">${key}</div>
              </td>
              <td class="block md:table-cell text-xs max-w-dvw md:max-w-80 wrap-break-word py-2 md:py-0">
                <div class="md:px-2">${description}</div>
              </td>
            `;
            exifTableBody.appendChild(row);
            foundAny = true;
          }
        }

        if (!foundAny) {
          exifTableBody.innerHTML =
            '<tr><td colspan="2" class="text-center italic">No metadata found</td></tr>';
        }

        const hasLat = !!tags.GPSLatitude;
        const hasLon = !!tags.GPSLongitude;

        if (hasLat && hasLon) {
          const { longitude: finalLon, latitude: finalLat } = gpsParseCoordinateFromExifTags(
            tags.GPSLongitude,
            tags.GPSLatitude,
            tags.GPSLongitudeRef,
            tags.GPSLatitudeRef
          );

          if (Number.isFinite(finalLat) && Number.isFinite(finalLon)) {
            gpsLink.href = gpsGenerateGoogleMapsLink(finalLat, finalLon);
            gpsContainer?.classList.remove('hidden');
          } else {
            gpsContainer?.classList.add('hidden');
          }
        } else {
          gpsContainer?.classList.add('hidden');
        }
      }
    } catch (error) {
      console.error('Error reading metadata:', error);
      if (exifTableBody)
        exifTableBody.innerHTML =
          '<tr><td colspan="2" class="text-center text-error">Error reading metadata</td></tr>';
      gpsContainer?.classList.add('hidden');
    }
  };

  const renderFileList = () => {
    if (!fileListContainer) return;
    fileListContainer.innerHTML = '';

    currentFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className =
        'file-item p-2 rounded cursor-pointer flex justify-between items-center transition-colors bg-base-200';
      item.innerHTML = `
        <span class="truncate text-sm font-medium">${file.name}</span>
        <span class="text-xs opacity-60">${(file.size / 1024).toFixed(1)} KB</span>
      `;
      item.onclick = () => updatePreview(index);
      fileListContainer.appendChild(item);
    });

    if (currentFiles.length > 0) {
      updatePreview(0);
      resultContainer?.classList.remove('hidden');
      if (resultTitle) resultTitle.textContent = `Selected Images (${currentFiles.length})`;

      if (currentFiles.length > 1) {
        if (downloadText) downloadText.textContent = 'Clean & Download All (ZIP)';
        downloadSelectedBtn?.classList.remove('hidden');
      } else {
        if (downloadText) downloadText.textContent = 'Clean & Download Image';
        downloadSelectedBtn?.classList.add('hidden');
      }
    } else {
      resultContainer?.classList.add('hidden');
    }
  };

  setupFileDropzone('dropzone', 'image-input', (files) => {
    currentFiles = Array.from(files);
    renderFileList();
  });

  const cleanImage = async (file: File): Promise<DownloadBuffer> => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

    if (!ctx) {
      URL.revokeObjectURL(objectUrl);
      throw new Error('Could not get canvas context');
    }

    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(objectUrl);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });

    if (!blob) {
      throw new Error('Blob creation failed');
    }

    return {
      data: await blob.arrayBuffer(),
      name: file.name.replace(/\.[^/.]+$/, '') + '_clean.jpg',
    };
  };

  downloadSelectedBtn.addEventListener('click', async () => {
    if (selectedIndex < 0 || selectedIndex >= currentFiles.length) return;

    downloadSelectedBtn.disabled = true;
    try {
      const file = currentFiles[selectedIndex];

      if (!isImageFile(file)) {
        // Not an image — just write out the original file
        const buf = await passthroughFile(file);
        await downloadFile(buf.data as ArrayBuffer, buf.name, file.type || 'application/octet-stream');
        showMessage(`Original file ${file.name} downloaded.`, { type: 'info', timeoutMs: 5000 });
      } else {
        const result = await cleanImage(file);
        await downloadFile(result.data as ArrayBuffer, result.name, 'image/jpeg');
        showMessage(`Cleaned version of ${file.name} downloaded.`, {
          type: 'info',
          timeoutMs: 5000,
        });
      }
    } catch (error) {
      console.error('Error stripping metadata:', error);
      showMessage('Failed to strip metadata.', { type: 'alert' });
    } finally {
      downloadSelectedBtn.disabled = false;
    }
  });

  downloadBtn.addEventListener('click', async () => {
    if (currentFiles.length === 0) return;

    downloadBtn.disabled = true;
    const originalText = downloadText?.textContent;
    if (downloadText) downloadText.textContent = 'Processing...';

    try {
      if (currentFiles.length === 1) {
        const file = currentFiles[0];
        if (!isImageFile(file)) {
          // Not an image — write out original
          const buf = await passthroughFile(file);
          await downloadFile(buf.data as ArrayBuffer, buf.name, file.type || 'application/octet-stream');
          showMessage('File downloaded.', { type: 'info', timeoutMs: 5000 });
        } else {
          const result = await cleanImage(file);
          await downloadFile(result.data as ArrayBuffer, result.name, 'image/jpeg');
          showMessage('Image saved without EXIF data.', { type: 'info', timeoutMs: 5000 });
        }
      } else {
        // Mix of images and non-images: clean images, passthrough others, then zip
        const results = await Promise.all(
          currentFiles.map((f) => (isImageFile(f) ? cleanImage(f) : passthroughFile(f)))
        );
        await downloadAsZip(results, 'cleaned_images.zip');
        showMessage(`${currentFiles.length} files saved (images cleaned).`, {
          type: 'info',
          timeoutMs: 5000,
        });
      }
    } catch (error) {
      console.error('Error stripping metadata:', error);
      showMessage('Failed to strip metadata.', { type: 'alert' });
    } finally {
      downloadBtn.disabled = false;
      if (downloadText && originalText) downloadText.textContent = originalText;
    }
  });
}
