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
  pdfDoc.insertPage(-1, outPage);

  outPage.destroy();
  img.destroy();
  resources.destroy();
  pdfImage.destroy();
}
