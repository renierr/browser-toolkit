import { setupFileDropzone } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import mupdf from 'mupdf';

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
        'Pages': doc.countPages().toString(),
      };

      // Extract standard metadata keys
      const keys = [
        'info:Title',
        'info:Author',
        'info:Subject',
        'info:Keywords',
        'info:Creator',
        'info:Producer',
        'info:CreationDate',
        'info:ModDate'
      ];

      keys.forEach(key => {
        try {
          const value = doc.getMetaData(key);
          if (value) {
            const label = key.replace('info:', '');
            metadata[label] = value;
          }
        } catch (e) {
          console.warn(`Could not read metadata key: ${key}`, e);
        }
      });

      if (tableBody) {
        tableBody.innerHTML = '';
        Object.entries(metadata).forEach(([key, value]) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="font-medium">${key}</td>
            <td class="break-all">${value}</td>
          `;
          tableBody.appendChild(row);
        });
      }

      dropzone?.classList.add('hidden');
      results?.classList.remove('hidden');
      showMessage('Metadata extracted successfully.');
    } catch (err) {
      console.error(err);
      showMessage('Failed to read PDF metadata. The file might be encrypted or invalid.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });
}
