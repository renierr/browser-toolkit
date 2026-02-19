import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { showProgress, hideProgress, showMessage } from '../../js/ui.ts';
import mupdf from 'mupdf';
import type { SharedFilesPayload } from '../../js/share-target.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const startOverBtn = document.getElementById('start-over-btn') as HTMLButtonElement;
  const dropzone = document.getElementById('pdf-dropzone') as HTMLDivElement;
  const restrictionsConfig = document.getElementById('restrictions-config') as HTMLDivElement;
  const noRestrictionsMsg = document.getElementById('no-restrictions-msg') as HTMLDivElement;
  const applyBtn = document.getElementById('apply-btn') as HTMLButtonElement;
  const removeAllBtn = document.getElementById('remove-all-btn') as HTMLButtonElement;

  const permPrint = document.getElementById('perm-print') as HTMLInputElement;
  const permCopy = document.getElementById('perm-copy') as HTMLInputElement;
  const permEdit = document.getElementById('perm-edit') as HTMLInputElement;
  const permAnnotate = document.getElementById('perm-annotate') as HTMLInputElement;
  const userPassword = document.getElementById('user-password') as HTMLInputElement;
  const ownerPassword = document.getElementById('owner-password') as HTMLInputElement;

  let originalPdfBytes: Uint8Array | null = null;
  let originalFileName = 'document.pdf';
  let password: string | null = null;
  let modified: boolean = false;

  const loadPdf = async (files: FileList | File[]) => {
    if (files.length === 0) return;
    showProgress('Loading PDF...');

    try {
      const file = files[0] as File;
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
  };

  setupFileDropzone('pdf-dropzone', 'pdf-file', loadPdf);

  if (payload?.sharedFiles?.length) {
    const pdfFiles = payload.sharedFiles.filter(
      (f) => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length > 0) {
      loadPdf(pdfFiles);
    }
  }

  async function processAndDownloadPdf(removeRestrictions: boolean) {
    if (!originalPdfBytes) return;
    showProgress('Processing PDF...');

    modified = !removeRestrictions;

    try {
      const doc = mupdf.Document.openDocument(originalPdfBytes, 'application/pdf');
      const pdf = doc.asPDF();
      if (!pdf) return;

      // Re-authenticate if needed
      if (password) pdf.authenticatePassword(password);

      const outDoc = new mupdf.PDFDocument();
      const graftMap = outDoc.newGraftMap();
      const pageCount = doc.countPages();
      for (let i = 0; i < pageCount; i++) {
        graftMap.graftPage(i, pdf, i);
      }
      graftMap.destroy();

      let saveOptions = 'incremental=false';
      if (!removeRestrictions) {
        let opwd = ownerPassword.value;
        let upwd = userPassword.value;

        // Start with the mandatory reserved bits (7-8, 13-32) set to 1.
        // This is -3904 (0xFFFFF0C0) as a signed 32-bit integer.
        let permissionsMask = -3904;

        // Add permissions based on checkboxes, including related Revision 3 bits
        if (permPrint.checked) {
          permissionsMask |= 1 << 2; // Bit 3: Print
          permissionsMask |= 1 << 11; // Bit 12: High quality print
        }
        if (permEdit.checked) {
          permissionsMask |= 1 << 3; // Bit 4: Modify
          permissionsMask |= 1 << 10; // Bit 11: Assemble (rotate/delete pages)
        }
        if (permCopy.checked) {
          permissionsMask |= 1 << 4; // Bit 5: Copy
        }
        if (permAnnotate.checked) {
          permissionsMask |= 1 << 5; // Bit 6: Annotate
          permissionsMask |= 1 << 8; // Bit 9: Fill forms
        }

        // Always allow accessibility (Bit 10) as it's good practice
        permissionsMask |= 1 << 9;

        // If restrictions are set, an owner password is required for them to be effective.
        // If the user didn't provide one, we use a default one to ensure enforcement.
        if (!opwd && permissionsMask !== -4) {
          opwd = 'restricted';
          showMessage('No owner password provided. Using "restricted" to enforce permissions.', {
            type: 'warning',
            timeoutMs: 15000,
          });
        }

        if (opwd || upwd || permissionsMask !== -4) {
          // Use (mask | 0) to ensure the signed integer string (e.g. "-4") is passed to MuPDF
          saveOptions += `,encrypt=aes-256,owner-password=${opwd},user-password=${upwd},permissions=${permissionsMask | 0}`;
        }
      }

      console.log(`Saving PDF with options: ${saveOptions}`);
      const buffer = outDoc.saveToBuffer(saveOptions);
      const processedPdfBytes = new Uint8Array(buffer.asUint8Array());
      buffer.destroy();
      doc.destroy();
      outDoc.destroy();

      const suffix = modified ? '_modified.pdf' : '_unrestricted.pdf';
      const fileName = originalFileName.replace(/\.pdf$/i, '') + suffix;
      await downloadFile(processedPdfBytes, fileName, 'application/pdf');
      showMessage(removeRestrictions ? 'Restrictions removed.' : 'Restrictions applied.', {
        timeoutMs: 3000,
      });
      showMessage('PDF downloaded successfully.', { timeoutMs: 5000 });
    } catch (err) {
      console.error(err);
      showMessage('An error occurred while processing the PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  }

  applyBtn.addEventListener('click', () => {
    processAndDownloadPdf(false);
  });

  removeAllBtn.addEventListener('click', () => {
    processAndDownloadPdf(true);
  });

  startOverBtn.addEventListener('click', () => {
    password = null;
    originalPdfBytes = null;
    originalFileName = 'document.pdf';
    dropzone.classList.remove('hidden');
    restrictionsConfig.classList.add('hidden');
    noRestrictionsMsg.classList.add('hidden');
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    userPassword.value = '';
    ownerPassword.value = '';
  });

  return () => {
    password = null;
    originalPdfBytes = null;
  };
}
