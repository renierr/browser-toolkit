import mupdf from 'mupdf';
import { addImageToPDFDocument } from '../../../js/mupdf-utils.ts';
import { downloadFile } from '../../../js/file-utils.ts';
import { showProgress, showMessage, hideProgress, yieldToUI } from '../../../js/ui.ts';
import type { ScannedPage } from '../types';

export async function generateAndDownloadPDF(pages: ScannedPage[]) {
  if (pages.length === 0) return;

  showProgress('Generating PDF...');
  const pdfDoc = new mupdf.PDFDocument();

  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      showProgress(`Processing page ${i + 1} of ${pages.length}...`);
      await yieldToUI();

      const imgData = page.processedCanvas.toDataURL('image/jpeg', 0.9);
      const response = await fetch(imgData);
      const imageBytes = await response.arrayBuffer();

      addImageToPDFDocument(pdfDoc, `Page_${i}`, new Uint8Array(imageBytes));
    }

    const pdfBytes = pdfDoc.saveToBuffer('compress,compress-images,garbage');
    await downloadFile(pdfBytes.asUint8Array(), `scanned-doc-${Date.now()}.pdf`, 'application/pdf');

    showMessage('PDF created successfully!', { type: 'info', timeoutMs: 5000 });
  } catch (error) {
    console.error('Failed to generate PDF', error);
    showMessage('Failed to generate PDF.', { type: 'alert' });
  } finally {
    pdfDoc.destroy();
    hideProgress();
  }
}
