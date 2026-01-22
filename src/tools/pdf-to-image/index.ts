import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';
import mupdf from 'mupdf';

const { PDFDocument } = await import('@cantoo/pdf-lib');

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    showProgress('Load PDF file...');
    try {
      const arrayBuffer = await files[0].arrayBuffer();
      const name = await flattenAsImage(arrayBuffer, files[0].name);
      if (name) {
        showMessage(`PDF ${files[0].name} converted to ${name} and downloaded.`);
      }
    } finally {
      hideProgress();
    }
  });
}

// ---------------------------------------------------------------
// Config – tweak for your needs
// ---------------------------------------------------------------
const CONFIG = {
  renderScale: 2.5, // 2.5 = good quality / speed, 4.166 ≈ 300 DPI
};

// ---------------------------------------------------------------
// Main flattening routine (browser only)
// ---------------------------------------------------------------
export async function flattenAsImage(pdfBuffer: ArrayBuffer, filename?: string) {
  showProgress('Loading PDF for flattening as images…');
  await yieldToUI();

  try {
    const name = filename?.replace(/\.[^.]+$/, '') + '_flat.pdf' || 'document_flat.pdf';

    // ---- 1. Load source PDF ------------------------------------------------
    const srcDoc = mupdf.Document.openDocument(pdfBuffer);
    const total = srcDoc.countPages();

    // ---- 2. Create destination PDF -----------------------------------------
    const pdfDoc = await PDFDocument.create();

    // ---- 3. Render and embed pages as images -----------------------------------------
    for (let i = 0; i < total; i++) {
      const progress = Math.round(((i + 1) / total) * 100);
      showProgress(`Flattening… ${progress}% (${i + 1}/${total})`);
      await yieldToUI();

      const page = srcDoc.loadPage(i);
      const mat = mupdf.Matrix.scale(CONFIG.renderScale, CONFIG.renderScale);
      const pixmap = page.toPixmap(mat, mupdf.ColorSpace.DeviceRGB, false);
      const imgWidth = pixmap.getWidth();
      const imgHeight = pixmap.getHeight();

      const img = await pdfDoc.embedPng(pixmap.asPNG());
      const outPage = pdfDoc.addPage([imgWidth, imgHeight]);
      outPage.drawImage(img, {
        x: 0,
        y: 0,
        width: imgWidth,
        height: imgHeight,
      });
    }

    showProgress('Saving PDF…');
    await yieldToUI();

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    await downloadFile(pdfBytes, name, 'application/pdf');
    return name;
  } catch (err: any) {
    console.error(err);
    showMessage(err?.message ?? 'Flattening failed', { type: 'alert' });
  } finally {
    hideProgress();
  }
}
