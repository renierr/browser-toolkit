import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';
import mupdf from 'mupdf';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (files) => {
    const dpi = parseInt((document.getElementById('opt-dpi') as HTMLInputElement)?.value);

    showProgress('Load PDF file...');
    try {
      const arrayBuffer = await files[0].arrayBuffer();
      const name = await flattenAsImage(arrayBuffer, files[0].name, { dpi });
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
};

export interface FlattenOptions {
  dpi?: number;
}

// ---------------------------------------------------------------
// Main flattening routine (browser only)
// ---------------------------------------------------------------
export async function flattenAsImage(
  pdfBuffer: ArrayBuffer,
  filename?: string,
  options: FlattenOptions = {}
) {
  const { dpi = DEFAULT_OPTIONS.dpi } = options;
  const scale = dpi / 72;

  showProgress('Loading PDF for flattening as images…');
  await yieldToUI();

  try {
    const name = filename?.replace(/\.[^.]+$/, '') + '_flat.pdf' || 'document_flat.pdf';

    // ---- 1. Load source PDF ------------------------------------------------
    const srcDoc = mupdf.Document.openDocument(pdfBuffer);
    const total = srcDoc.countPages();

    // ---- 2. Create destination PDF -----------------------------------------
    const buffer = new mupdf.Buffer();
    const pdfWriter = new mupdf.DocumentWriter(
      buffer,
      'PDF',
      'incremental,garbage,compress,compress-images'
    );

    try {

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

        const device = pdfWriter.beginPage([0, 0, imgWidth, imgHeight]);
        const ctm = mupdf.Matrix.scale(imgWidth, imgHeight);
        device.fillImage(new mupdf.Image(pixmap), ctm, 1);
        device.close();
        pdfWriter.endPage();

        device.destroy();
        pixmap.destroy();
        page.destroy();
      }

      showProgress('Saving PDF…');
      await yieldToUI();
      pdfWriter.close();
      await downloadFile(buffer.asUint8Array(), name, 'application/pdf');
      return name;
    } finally {
      buffer.destroy();
      pdfWriter.destroy();
    }
  } catch (err: any) {
    console.error(err);
    showMessage(err?.message ?? 'Flattening failed', { type: 'alert' });
  } finally {
    hideProgress();
  }
}
