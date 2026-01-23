import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import mupdf from 'mupdf';
import { formatPdfDate } from '../../js/pdf-utils.ts';

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
export default function init() {
  const dropzone = document.getElementById('pdf-dropzone');
  const results = document.getElementById('metadata-results');
  const tableBody = document.getElementById('metadata-table-body');
  const resetBtn = document.getElementById('reset-btn');

  const reset = () => {
    if (dropzone) dropzone.classList.remove('hidden');
    if (results) results.classList.add('hidden');
    if (tableBody) tableBody.innerHTML = '';
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  resetBtn?.addEventListener('click', reset);

  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files: FileList) => {
    if (files.length === 0) return;
    const file = files[0];

    showProgress('Reading PDF metadata...');
    try {
      const buffer = await file.arrayBuffer();
      const doc = mupdf.Document.openDocument(buffer);

      const metadata: Record<string, string> = {
        'File Name': file.name,
        'File Size': (file.size / 1024).toFixed(2) + ' KB',
        Pages: doc.countPages().toString(),
      };

      standardKeys.forEach((key) => {
        const label = key.replace('info:', '');
        if (!metadata[label]) {
          try {
            const value = doc.getMetaData(key);
            if (value) metadata[label] = formatPdfDate(value);
          } catch (e) {
            console.warn(`Could not read metadata key: ${key}`, e);
          }
        }
      });

      // additional metadata from info dict and XMP
      const pdfDoc = doc.asPDF();
      if (pdfDoc) {
        const trailer = pdfDoc.getTrailer();

        // 1. Info Dictionary
        const info = trailer.get('Info');
        if (info && info.isDictionary()) {
          // @ts-ignore - MuPDF JS dictionaries use forEach for iteration
          info.forEach((val: any, key: any) => {
            if (val) {
              // remove surrounded () from value
              let valStr = val.toString();
              if (valStr.startsWith('(') && valStr.endsWith(')')) {
                valStr = valStr.slice(1, -1);
              }
              if (val) {
                const label = key.toString();
                if (!metadata[label]) {
                  if (valStr) metadata[label] = formatPdfDate(valStr);
                }
              }
            }
          });
        }

        // 2. XMP Metadata (from Root/Catalog)
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
                  metadata['XMP Metadata'] = `<pre class="text-xs max-h-60 overflow-auto p-2 bg-base-200 rounded mt-2 whitespace-pre-wrap break-all">${xmpText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
                }
              }
            }
          }
        } catch (e) {
          console.warn('Could not read XMP metadata', e);
        }
      }

      if (tableBody) {
        tableBody.innerHTML = '';
        Object.entries(metadata).forEach(([key, value]) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="font-medium align-top pt-2">${key}</td>
            <td class="break-all pt-2">${value}</td>
          `;
          tableBody.appendChild(row);
        });
      }

      dropzone?.classList.add('hidden');
      results?.classList.remove('hidden');
      showMessage('Metadata extracted successfully.', { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('Failed to read PDF metadata. The file might be encrypted or invalid.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });
}
