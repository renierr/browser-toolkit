import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui.ts';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from '@cantoo/pdf-lib';

// Use Vite's asset handling to resolve the worker path
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;


export default function init() {
  setupFileDropzone('pdf-dropzone', 'pdf-file', async (file) => {
    showProgress('Load PDF file...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const name = await flattenAsImage(arrayBuffer, file.name);
      showMessage(`PDF ${file.name} converted to ${name} and downloaded.`);
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
  chunkSize: 3, // pages rendered in one animation frame
  maxParallel: 2, // how many pages render at the same time
};

// ---------------------------------------------------------------
// Helper: original page size in PDF points
// ---------------------------------------------------------------
function originalSize(page: any) {
  const vp = page.getViewport({ scale: 1.0 });
  return { width: vp.width, height: vp.height };
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

async function renderPage(page: any, scale: number) {
  const viewport = page.getViewport({ scale });
  const { canvas, ctx } = createCanvas(viewport.width, viewport.height);

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
  });

  await renderTask.promise; // ← This MUST resolve before next render

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png', 1.0)
  );

  return {
    pngBytes: new Uint8Array(await blob.arrayBuffer()),
    originalSize: originalSize(page),
  };
}

// ---------------------------------------------------------------
// Main flattening routine (browser only)
// ---------------------------------------------------------------
export async function flattenAsImage(pdfBuffer: ArrayBuffer, filename?: string) {
  showProgress('Loading PDF for flattening as images…');
  await yieldToUI();

  try {
    const name = filename?.replace(/\.[^.]+$/, '') + '_flat.pdf' || 'document_flat.pdf';

    // ---- 1. Load source PDF ------------------------------------------------
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    const total = pdf.numPages;

    // ---- 2. Pre-fetch all page objects ------------------------------------
    const pagePromises = Array.from({ length: total }, (_, i) => pdf.getPage(i + 1));
    const pages = await Promise.all(pagePromises);
    showProgress('Pages pre-fetched, flattening as images…');
    await yieldToUI();

    // ---- 3. Create destination PDF -----------------------------------------
    const pdfDoc = await PDFDocument.create();

    // ---- 4. Render in chunks (keeps UI responsive) -------------------------
    const results: Array<{
      pngBytes: Uint8Array;
      originalSize: { width: number; height: number };
    }> = [];

    for (let startIdx = 0; startIdx < total; startIdx += CONFIG.chunkSize) {
      const endIdx = Math.min(startIdx + CONFIG.chunkSize, total);
      const chunk = pages.slice(startIdx, endIdx);

      // render up to MAX_PARALLEL pages in parallel
      const chunkResults = await Promise.all(chunk.map((p) => renderPage(p, CONFIG.renderScale)));

      results.push(...chunkResults);

      // update UI
      const progress = Math.round(((startIdx + chunk.length) / total) * 100);
      showProgress(`Flattening… ${progress}% (${startIdx + chunk.length}/${total})`);
      await yieldToUI();
    }
    showProgress('Embedding Images to new PDF');
    await yieldToUI();

    // ---- 5. Embed images into the new PDF ----------------------------------
    for (let i = 0; i < results.length; i++) {
      showProgress(`Embedding flatten Image to PDF… (${i + 1}/${results.length})`);
      await yieldToUI();

      const { pngBytes, originalSize } = results[i];
      const img = await pdfDoc.embedPng(pngBytes);
      const page = pdfDoc.addPage([originalSize.width, originalSize.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: originalSize.width,
        height: originalSize.height,
      });
    }

    // ---- 6. Save & download -------------------------------------------------
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    await downloadFile(new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }), name);
    return name;
  } catch (err: any) {
    console.error(err);
    showMessage(err?.message ?? 'Flattening failed', { type: 'alert' });
  } finally {
    hideProgress();
  }
}
