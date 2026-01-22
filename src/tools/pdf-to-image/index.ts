import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';
import mupdf from 'mupdf';

const { PDFDocument } = await import('@cantoo/pdf-lib');

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    const dpi = parseInt((document.getElementById('opt-dpi') as HTMLInputElement)?.value);
    const format = (document.getElementById('opt-format') as HTMLSelectElement)?.value as 'jpeg' | 'png';
    const quality = parseInt((document.getElementById('opt-quality') as HTMLInputElement)?.value);

    showProgress('Load PDF file...');
    try {
      const arrayBuffer = await files[0].arrayBuffer();
      const name = await flattenAsImage(arrayBuffer, files[0].name, { dpi, format, quality });
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
const DEFAULT_OPTIONS = {
  dpi: 180, // 180 DPI ≈ 2.5 scale
  format: 'jpeg' as 'jpeg' | 'png',
  quality: 95,
};

export interface FlattenOptions {
  dpi?: number;
  format?: 'jpeg' | 'png';
  quality?: number;
}

// ---------------------------------------------------------------
// Main flattening routine (browser only)
// ---------------------------------------------------------------
export async function flattenAsImage(
  pdfBuffer: ArrayBuffer,
  filename?: string,
  options: FlattenOptions = {}
) {
  const { dpi = DEFAULT_OPTIONS.dpi, format = DEFAULT_OPTIONS.format, quality = DEFAULT_OPTIONS.quality } = options;
  const scale = dpi / 72;

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
      const mat = mupdf.Matrix.scale(scale, scale);
      const pixmap = page.toPixmap(mat, mupdf.ColorSpace.DeviceRGB, false);
      const imgWidth = pixmap.getWidth();
      const imgHeight = pixmap.getHeight();

      let img;
      if (format === 'png') {
        const imgBuffer = pixmap.asPNG();
        img = await pdfDoc.embedPng(imgBuffer);
      } else {
        const imgBuffer = pixmap.asJPEG(quality, false);
        img = await pdfDoc.embedJpg(imgBuffer);
      }

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
