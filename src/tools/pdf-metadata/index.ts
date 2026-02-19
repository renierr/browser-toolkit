import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import mupdf, { type Document } from 'mupdf';
import { formatPdfDate, parseXmpMetadata, flattenXmpMetadata } from '../../js/pdf-utils.ts';
import type { SharedFilesPayload } from '../../js/share-target.ts';

// standard metadata info
const standardKeys = [
  mupdf.Document.META_INFO_TITLE,
  mupdf.Document.META_INFO_AUTHOR,
  mupdf.Document.META_INFO_SUBJECT,
  mupdf.Document.META_INFO_KEYWORDS,
  mupdf.Document.META_INFO_CREATOR,
  mupdf.Document.META_INFO_PRODUCER,
  mupdf.Document.META_INFO_CREATIONDATE,
  mupdf.Document.META_INFO_MODIFICATIONDATE,
  mupdf.Document.META_FORMAT,
];

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const dropzone = document.getElementById('pdf-dropzone');
  const results = document.getElementById('metadata-results');
  const tableBody = document.getElementById('metadata-table-body');
  const resetBtn = document.getElementById('reset-btn');
  const thumbnailContainer = document.getElementById('thumbnail-container');

  const reset = () => {
    if (dropzone) dropzone.classList.remove('hidden');
    if (results) results.classList.add('hidden');
    if (tableBody) tableBody.innerHTML = '';
    if (thumbnailContainer) {
      thumbnailContainer.classList.add('hidden');
      const images = thumbnailContainer.querySelectorAll('img');
      images.forEach((img) => img.remove());
    }
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  resetBtn?.addEventListener('click', reset);

  const processFile = async (file: File) => {
    showProgress('Reading PDF metadata...');
    let doc: Document | null = null;
    try {
      const buffer = await file.arrayBuffer();
      doc = mupdf.Document.openDocument(buffer);

      const metadata: Record<string, any> = {
        'File Name': file.name,
        'File Size': (file.size / 1024).toFixed(2) + ' KB',
        Pages: doc.countPages().toString(),
      };

      standardKeys.forEach((key) => {
        const label = key.replace('info:', '');
        if (!metadata[label]) {
          try {
            const value = doc?.getMetaData(key);
            if (value) metadata[label] = formatPdfDate(value);
          } catch (e) {
            console.warn(`Could not read metadata key: ${key}`, e);
          }
        }
      });

      const pdfDoc = doc.asPDF();
      if (pdfDoc) {
        const trailer = pdfDoc.getTrailer();

        // 1. Info Dictionary
        const info = trailer.get('Info');
        if (info && info.isDictionary()) {
          // @ts-ignore
          info.forEach((val: any, key: any) => {
            if (val) {
              let valStr = val.toString();
              if (valStr.startsWith('(') && valStr.endsWith(')')) {
                valStr = valStr.slice(1, -1);
              }
              const label = key.toString();
              if (!metadata[label]) {
                metadata[label] = formatPdfDate(valStr);
              }
            }
          });
        }

        // 2. XMP Metadata
        try {
          const root = trailer.get('Root');
          if (root && root.isDictionary()) {
            const xmp = root.get('Metadata');
            if (xmp && xmp.isStream()) {
              const xmpBuffer = xmp.readStream();
              if (xmpBuffer) {
                const decoder = new TextDecoder('utf-8');
                const xmpText = decoder.decode(xmpBuffer.asUint8Array());
                if (xmpText) {
                  const parsedXmp = parseXmpMetadata(xmpText);
                  const flattenedXmp = flattenXmpMetadata(parsedXmp);
                  Object.assign(metadata, flattenedXmp);
                }
              }
            }
            xmp.destroy();
          }
          root.destroy();
        } catch (e) {
          console.warn('Could not read XMP metadata', e);
        }
        trailer.destroy();
      }

      if (tableBody) {
        tableBody.innerHTML = '';
        Object.entries(metadata).forEach(([key, value]) => {
          if (!value || value === 'undefined' || value === 'null') return;

          if (typeof value === 'object' && value.type === 'image' && thumbnailContainer) {
            thumbnailContainer.classList.remove('hidden');
            const img = document.createElement('img');
            img.src = `data:image/${value.format};base64,${value.data}`;
            img.className =
              'max-w-[200px] h-auto shadow-lg rounded-lg border-4 border-white bg-white m-2';
            img.title = key;
            thumbnailContainer.appendChild(img);
            return;
          }

          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="font-medium align-top pt-2 text-sm text-base-content/70">${key}</td>
            <td class="break-all pt-2 text-sm">${String(value)}</td>
          `;
          tableBody.appendChild(row);
        });
      }

      dropzone?.classList.add('hidden');
      results?.classList.remove('hidden');
      showMessage('Metadata extracted successfully.', { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('Failed to read PDF metadata.', { type: 'alert' });
    } finally {
      doc?.destroy();
      hideProgress();
    }
  };

  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files: FileList) => {
    if (files.length === 0) return;
    await processFile(files[0]);
  });

  if (payload?.sharedFiles?.length) {
    const pdfFile = payload.sharedFiles.find(
      (f) => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')
    );
    if (pdfFile) {
      processFile(pdfFile);
    }
  }
}
