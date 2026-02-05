import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { showProgress, hideProgress, showMessage } from '../../js/ui.ts';
import mupdf from 'mupdf';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const startOverBtn = document.getElementById('start-over-btn') as HTMLButtonElement;
  const dropzone = document.getElementById('pdf-dropzone') as HTMLDivElement;
  const processingSection = document.getElementById('processing-section') as HTMLDivElement;

  let originalPdfBytes: Uint8Array | null = null;
  let originalFileName = 'document.pdf';
  let processedPdfBytes: Uint8Array | null = null;

  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    if (files.length === 0) {
      return;
    }
    showProgress('Loading PDF...');

    try {
      const file = files[0];
      originalPdfBytes = new Uint8Array(await file.arrayBuffer());
      originalFileName = file.name;

      if (!originalPdfBytes) {
        showMessage('Failed to load PDF file.', { type: 'alert' });
        return;
      }

      showProgress('Removing restrictions...');
      const doc = mupdf.Document.openDocument(originalPdfBytes, 'application/pdf');
      const pdf = doc.asPDF();
      if (!pdf) return;
      if (pdf.needsPassword()) {
        if (!pdf.authenticatePassword('')) {
          const password = prompt('Enter password to open PDF');
          if (!password || !pdf.authenticatePassword(password)) {
            showMessage('Incorrect password or no password entered.', { type: 'alert' });
            doc.destroy();
            return;
          }
        }
      }

      const outDoc = new mupdf.PDFDocument();
      const graftMap = outDoc.newGraftMap();
      const pageCount = doc.countPages();
      for (let i = 0; i < pageCount; i++) {
        graftMap.graftPage(i, pdf, i);
      }
      graftMap.destroy();

      // By default, mupdf creates documents with no restrictions.
      // Saving it effectively removes them.
      processedPdfBytes = outDoc.saveToBuffer().asUint8Array();

      doc.destroy();
      outDoc.destroy();

      dropzone.classList.add('hidden');
      processingSection.classList.remove('hidden');
      downloadBtn.disabled = false;

      showMessage('PDF restrictions removed successfully.', { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('An error occurred while processing the PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  downloadBtn.addEventListener('click', async () => {
    if (processedPdfBytes) {
      const fileName = originalFileName.replace(/\.pdf$/i, '') + '_unrestricted.pdf';
      await downloadFile(processedPdfBytes, fileName, 'application/pdf');
      showMessage('PDF downloaded successfully.', { timeoutMs: 5000 });
    }
  });

  startOverBtn.addEventListener('click', () => {
    originalPdfBytes = null;
    processedPdfBytes = null;
    originalFileName = 'document.pdf';
    dropzone.classList.remove('hidden');
    processingSection.classList.add('hidden');
    downloadBtn.disabled = true;
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  });

  return () => {
    originalPdfBytes = null;
    processedPdfBytes = null;
  };
}
