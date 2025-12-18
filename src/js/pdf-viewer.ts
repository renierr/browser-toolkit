import 'pdfjs-dist/web/pdf_viewer.css';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.mjs';

import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const container = document.getElementById('pageContainer');

export async function renderPdfFromUrl(url: string) {
  if (!container) return;

  const pdf = await pdfjsLib.getDocument({ url }).promise;
  container.innerHTML = '';
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to obtain 2D canvas context');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
}

window.addEventListener('message', (ev) => {
  if (ev.data?.type === 'load-pdf' && ev.data.url) {
    renderPdfFromUrl(ev.data.url).catch((e) => console.error('Failed to render PDF', e));
  }
}, false);
