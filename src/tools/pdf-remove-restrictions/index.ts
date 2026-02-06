import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { showProgress, hideProgress, showMessage } from '../../js/ui.ts';
import mupdf from 'mupdf';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const startOverBtn = document.getElementById('start-over-btn') as HTMLButtonElement;
  const dropzone = document.getElementById('pdf-dropzone') as HTMLDivElement;
  const processingSection = document.getElementById('processing-section') as HTMLDivElement;
  const restrictionsConfig = document.getElementById('restrictions-config') as HTMLDivElement;
  const noRestrictionsMsg = document.getElementById('no-restrictions-msg') as HTMLDivElement;
  const applyBtn = document.getElementById('apply-btn') as HTMLButtonElement;
  const removeAllBtn = document.getElementById('remove-all-btn') as HTMLButtonElement;

  const permPrint = document.getElementById('perm-print') as HTMLInputElement;
  const permCopy = document.getElementById('perm-copy') as HTMLInputElement;
  const permEdit = document.getElementById('perm-edit') as HTMLInputElement;
  const permAnnotate = document.getElementById('perm-annotate') as HTMLInputElement;
  const ownerPassword = document.getElementById('owner-password') as HTMLInputElement;

  let originalPdfBytes: Uint8Array | null = null;
  let originalFileName = 'document.pdf';
  let processedPdfBytes: Uint8Array | null = null;
  let password : string | null = null;
  let modified : boolean = false;

  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    if (files.length === 0) return;
    showProgress('Loading PDF...');

    try {
      const file = files[0];
      originalPdfBytes = new Uint8Array(await file.arrayBuffer());
      originalFileName = file.name;

      const doc = mupdf.Document.openDocument(originalPdfBytes, 'application/pdf');
      const pdf = doc.asPDF();
      if (!pdf) {
        showMessage('Not a valid PDF document.', { type: 'alert' });
        return;
      }

      if (pdf.needsPassword()) {
        if (!pdf.authenticatePassword('')) {
          password = prompt('Enter password to open PDF');
          if (!password || !pdf.authenticatePassword(password)) {
            showMessage('Incorrect password or no password entered.', { type: 'alert' });
            doc.destroy();
            return;
          }
        }
      }

      // Check for existing restrictions
      const canPrint = pdf.hasPermission('print');
      const canCopy = pdf.hasPermission('copy');
      const canEdit = pdf.hasPermission('edit');
      const canAnnotate = pdf.hasPermission('annotate');

      const hasRestrictions = !canPrint || !canCopy || !canEdit || !canAnnotate;

      if (!hasRestrictions) {
        noRestrictionsMsg.classList.remove('hidden');
      } else {
        noRestrictionsMsg.classList.add('hidden');
      }

      // Set initial checkbox states based on current permissions
      permPrint.checked = canPrint;
      permCopy.checked = canCopy;
      permEdit.checked = canEdit;
      permAnnotate.checked = canAnnotate;

      dropzone.classList.add('hidden');
      restrictionsConfig.classList.remove('hidden');

      doc.destroy();
    } catch (err) {
      console.error(err);
      showMessage('An error occurred while loading the PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  });

  async function processPdf(removeRestrictions: boolean) {
    if (!originalPdfBytes) return;
    showProgress('Processing PDF...');

    modified = !removeRestrictions;

    try {
      const doc = mupdf.Document.openDocument(originalPdfBytes, 'application/pdf');
      const pdf = doc.asPDF();
      if (!pdf) return;

      // Re-authenticate if needed
      if (password)
        pdf.authenticatePassword(password);

      const outDoc = new mupdf.PDFDocument();
      const graftMap = outDoc.newGraftMap();
      const pageCount = doc.countPages();
      for (let i = 0; i < pageCount; i++) {
        graftMap.graftPage(i, pdf, i);
      }
      graftMap.destroy();

      let saveOptions = 'incremental=false';
      if (!removeRestrictions) {
        const opwd = ownerPassword.value;
        // Default permissions bitmask (all allowed except those we might unset)
        // PDF permissions are a bit tricky: 0xFFFFFFFC allows everything.
        // We start with a base that allows most things and then mask based on UI.
        let permissionsMask = 0xFFFFFFFC;

        if (!permPrint.checked) permissionsMask &= ~(1 << 2);
        if (!permEdit.checked) permissionsMask &= ~(1 << 3);
        if (!permCopy.checked) permissionsMask &= ~(1 << 4);
        if (!permAnnotate.checked) permissionsMask &= ~(1 << 5);

        if (opwd || permissionsMask !== 0xFFFFFFFC) {
          saveOptions += `,encrypt=aes-256,owner=${opwd},user=,permissions=${permissionsMask}`;
        }
      }

      console.log(`Saving PDF with options: ${saveOptions}`);
      const buffer = outDoc.saveToBuffer(saveOptions);
      processedPdfBytes = new Uint8Array(buffer.asUint8Array());
      buffer.destroy();
      doc.destroy();
      outDoc.destroy();

      restrictionsConfig.classList.add('hidden');
      processingSection.classList.remove('hidden');
      downloadBtn.disabled = false;

      showMessage(removeRestrictions ? 'Restrictions removed.' : 'Restrictions applied.', { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('An error occurred while processing the PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  }

  applyBtn.addEventListener('click', () => processPdf(false));
  removeAllBtn.addEventListener('click', () => processPdf(true));

  downloadBtn.addEventListener('click', async () => {
    if (processedPdfBytes) {
      const suffix = modified ? '_modified.pdf' : '_unrestricted.pdf';
      const fileName = originalFileName.replace(/\.pdf$/i, '') + suffix;
      await downloadFile(processedPdfBytes, fileName, 'application/pdf');
      showMessage('PDF downloaded successfully.', { timeoutMs: 5000 });
    }
  });

  startOverBtn.addEventListener('click', () => {
    password = null;
    originalPdfBytes = null;
    processedPdfBytes = null;
    originalFileName = 'document.pdf';
    dropzone.classList.remove('hidden');
    restrictionsConfig.classList.add('hidden');
    processingSection.classList.add('hidden');
    noRestrictionsMsg.classList.add('hidden');
    downloadBtn.disabled = true;
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    ownerPassword.value = '';
  });

  return () => {
    password = null;
    originalPdfBytes = null;
    processedPdfBytes = null;
  };
}
