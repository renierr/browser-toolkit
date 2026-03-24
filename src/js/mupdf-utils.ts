import mupdf, { type Font, type Document, type PDFDocument, Pixmap } from 'mupdf';

const fontCache: Map<string, Font> = new Map();

const FONT_FILES: Record<string, string> = {
  'NotoSans-Regular': './fonts/NotoSans-Regular.ttf',
  'NotoSans-Bold': './fonts/NotoSans-Bold.ttf',
  'NotoSans-Italic': './fonts/NotoSans-Italic.ttf',
  'NotoSans-BoldItalic': './fonts/NotoSans-BoldItalic.ttf',
  cjk: './fonts/NotoSansCJK-Regular.ttc',
  emoji: './fonts/NotoEmoji-Regular.ttf',
};

let fontLoaderInitialized = false;

async function loadFontFromUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font: ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function ensureFontLoaded(name: string): Promise<Font | null> {
  if (fontCache.has(name)) {
    return fontCache.get(name)!;
  }

  const fontUrl = FONT_FILES[name];
  if (!fontUrl) {
    return null;
  }

  try {
    const fontData = await loadFontFromUrl(fontUrl);
    const font = new mupdf.Font(name, fontData);
    fontCache.set(name, font);
    return font;
  } catch (e) {
    console.warn(`Failed to load font ${name}:`, e);
    return null;
  }
}

function createFontLoader(): (
  name: string,
  script: string,
  bold: boolean,
  italic: boolean
) => Font | null {
  return (name: string, script: string, bold: boolean, italic: boolean): Font | null => {
    const cjkScripts = ['Hans', 'Hant', 'Jpan', 'Kore', 'Hira', 'Kana'];
    const emojiScripts = ['Zsye'];

    if (emojiScripts.includes(script) || name === 'emoji' || name === 'NotoEmoji') {
      return fontCache.get('emoji') || null;
    }

    if (cjkScripts.includes(script) || name === 'cjk' || name === 'NotoSansCJK') {
      return fontCache.get('cjk') || null;
    }

    if (name === 'NotoSans') {
      let fontName = 'NotoSans-Regular';
      if (bold && italic) {
        fontName = 'NotoSans-BoldItalic';
      } else if (bold) {
        fontName = 'NotoSans-Bold';
      } else if (italic) {
        fontName = 'NotoSans-Italic';
      }
      return fontCache.get(fontName) || null;
    }

    return null;
  };
}

export async function initUnicodeFontLoader(): Promise<void> {
  if (fontLoaderInitialized) {
    return;
  }

  try {
    for (const name of Object.keys(FONT_FILES)) {
      await ensureFontLoaded(name);
    }

    mupdf.installLoadFontFunction(createFontLoader());
    fontLoaderInitialized = true;
  } catch (e) {
    console.error('Failed to initialize Unicode font loader:', e);
  }
}

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
  await initUnicodeFontLoader();

  const htmlContent = wrapTextByScript(html);

  const { width = 595, height = 842, fontSize = 12 } = options;
  const encoded = new TextEncoder().encode(htmlContent);
  const doc = mupdf.Document.openDocument(encoded, 'text/html');
  doc.layout(width, height, fontSize);

  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, 'pdf', 'compress');

  let pdfDoc: (Document & PDFDocument) | null = null;
  let outBuf: any = null;

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
    writer.destroy();

    const pdfData = buf.asUint8Array();
    buf.destroy();

    pdfDoc = mupdf.Document.openDocument(pdfData, 'application/pdf').asPDF();
    if (pdfDoc === null) return pdfData;

    pdfDoc.subsetFonts();

    outBuf = pdfDoc.saveToBuffer('compress,compress-fonts,compress-images');
    const result = new Uint8Array(outBuf.asUint8Array());

    outBuf.destroy();
    pdfDoc.destroy();
    doc.destroy();

    return result;
  } catch (e) {
    try {
      writer.destroy();
    } catch (ee) {}
    try {
      buf.destroy();
    } catch (ee) {}
    try {
      outBuf?.destroy();
    } catch (ee) {}
    try {
      pdfDoc?.destroy();
    } catch (ee) {}
    try {
      doc.destroy();
    } catch (ee) {}
    throw e;
  }
}

function wrapTextByScript(html: string): string {
  const cjkRegex =
    /([\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{3000}-\u{303f}\u{3040}-\u{309f}\u{30a0}-\u{30ff}\u{3100}-\u{312f}\u{3131}-\u{318e}\u{3190}-\u{319f}\u{31a0}-\u{31bf}\u{31f0}-\u{31ff}\u{3300}-\u{33ff}\u{f900}-\u{faff}]+)/gu;
  const emojiRegex =
    /([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]+)/gu;
  const specialCharsRegex = /([✔️✓✗✘©®™§¶†‡•…‰′″¤€£¥¢±∞≠≈÷×☑☒]+)/gu;

  let result = html;

  result = result.replace(cjkRegex, '<span style="font-family: cjk, sans-serif;">$1</span>');

  result = result.replace(emojiRegex, '<span style="font-family: emoji, sans-serif;">$1</span>');

  result = result.replace(
    specialCharsRegex,
    '<span style="font-family: emoji, sans-serif;">$1</span>'
  );

  return result;
}
