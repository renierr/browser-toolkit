import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';
import mupdf, { Pixmap } from 'mupdf';
import { addImageToPDFDocument } from '../../js/mupdf-utils.ts';
import type { SharedFilesPayload } from '../../js/share-target.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const processFiles = async (files: FileList | File[]) => {
    const dpi = parseInt((document.getElementById('opt-dpi') as HTMLInputElement)?.value);
    const format = (document.getElementById('opt-format') as HTMLSelectElement)?.value as
      | 'jpeg'
      | 'png';
    const quality = parseInt((document.getElementById('opt-quality') as HTMLInputElement)?.value);

    showProgress('Load PDF file...');
    try {
      const file = files[0] as File;
      const arrayBuffer = await file.arrayBuffer();
      const name = await flattenAsImage(arrayBuffer, file.name, { dpi, format, quality });
      if (name) {
        showMessage(`PDF ${file.name} converted to ${name} and downloaded.`);
      }
    } finally {
      hideProgress();
    }
  };

  setupFileDropzone('pdf-dropzone', 'pdf-file', processFiles);

  if (payload?.sharedFiles?.length) {
    const pdfFiles = payload.sharedFiles.filter(
      (f) => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length > 0) {
      processFiles(pdfFiles);
    }
  }
}

// ---------------------------------------------------------------
// Config – tweak for your needs
// ---------------------------------------------------------------
const DEFAULT_OPTIONS = {
  dpi: 180, // 180 DPI ≈ 2.5 scale
  format: 'pixmap' as 'jpeg' | 'png' | 'pixmap',
  quality: 95,
};

export interface FlattenOptions {
  dpi?: number;
  format?: 'jpeg' | 'png' | 'pixmap';
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
  const {
    dpi = DEFAULT_OPTIONS.dpi,
    format = DEFAULT_OPTIONS.format,
    quality = DEFAULT_OPTIONS.quality,
  } = options;
  const scale = dpi / 72;

  showProgress('Loading PDF for flattening as images…');
  await yieldToUI();

  try {
    const name = filename?.replace(/\.[^.]+$/, '') + '_flat.pdf' || 'document_flat.pdf';

    const srcDoc = mupdf.Document.openDocument(pdfBuffer);
    const total = srcDoc.countPages();
    const pdfDoc = new mupdf.PDFDocument();

    try {
      for (let i = 0; i < total; i++) {
        const progress = Math.round(((i + 1) / total) * 100);
        showProgress(`Flattening… ${progress}% (${i + 1}/${total})`);
        await yieldToUI();

        const page = srcDoc.loadPage(i);
        const mat = mupdf.Matrix.scale(scale, scale);
        const pixmap = page.toPixmap(mat, mupdf.ColorSpace.DeviceRGB, false);

        let imgBuffer: Uint8Array<ArrayBufferLike> | Pixmap;
        switch (format) {
          case 'jpeg':
            imgBuffer = pixmap.asJPEG(quality, false);
            break;
          case 'png':
            imgBuffer = pixmap.asPNG();
            break;
          default:
            imgBuffer = pixmap;
            break;
        }

        addImageToPDFDocument(pdfDoc, i.toString(), imgBuffer);

        page.destroy();
        pixmap.destroy();
      }

      showProgress('Saving PDF…');
      await yieldToUI();

      const pdfBytes = pdfDoc.saveToBuffer('compress,compress-images,garbage');
      await downloadFile(new Uint8Array(pdfBytes.asUint8Array()), name, 'application/pdf');
      pdfBytes.destroy();

      return name;
    } finally {
      pdfDoc.destroy();
      srcDoc.destroy();
    }
  } catch (err: any) {
    console.error(err);
    showMessage(err?.message ?? 'Flattening failed', { type: 'alert' });
  } finally {
    hideProgress();
  }
}
