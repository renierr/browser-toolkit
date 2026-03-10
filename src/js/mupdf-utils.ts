import mupdf, { type PDFDocument, Pixmap } from 'mupdf';

export function addImageToPDFDocument(
  pdfDoc: PDFDocument,
  id: string,
  imgBuffer: Uint8Array<ArrayBufferLike> | Pixmap
) {
  const pdfImage = new mupdf.Image(imgBuffer as any);
  const img = pdfDoc.addImage(pdfImage);
  const imgId = 'Img_' + id;
  const imgWidth = pdfImage.getWidth();
  const imgHeight = pdfImage.getHeight();

  const resources = pdfDoc.addObject({
    XObject: { [imgId]: img },
  });

  const contents = `q ${imgWidth} 0 0 ${imgHeight} 0 0 cm /${imgId} Do Q`;
  const outPage = pdfDoc.addPage([0, 0, imgWidth, imgHeight], 0, resources, contents);

  try {
    pdfDoc.insertPage(-1, outPage);
  } finally {
    outPage.destroy();
    img.destroy();
    resources.destroy();
    pdfImage.destroy();
  }

}

export interface HtmlToPdfOptions {
  width?: number;
  height?: number;
  fontSize?: number;
}

export async function htmlToPdfBuffer(
  html: string,
  options: HtmlToPdfOptions = {}
): Promise<Uint8Array> {
  const { width = 595, height = 842, fontSize = 12 } = options;
  const encoded = new TextEncoder().encode(html);
  const doc = mupdf.Document.openDocument(encoded, 'application/xhtml+xml');
  doc.layout(width, height, fontSize);

  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, 'pdf', 'compress');

  try {
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      const dev = writer.beginPage(page.getBounds());
      page.run(dev, mupdf.Matrix.identity);
      writer.endPage();
      dev.destroy();
      page.destroy();
    }
    writer.close();
    return new Uint8Array(buf.asUint8Array());
  } finally {
    try { writer.destroy(); } catch (e) {}
    try { buf.destroy(); } catch (e) {}
    try { doc.destroy(); } catch (e) {}
  }
}

