import mupdf, { type Font, type PDFDocument, Pixmap } from 'mupdf';

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

  const { width = 595, height = 842, fontSize = 12 } = options;
  const encoded = new TextEncoder().encode(html);
  const doc = mupdf.Document.openDocument(encoded, 'application/xhtml+xml');
  doc.layout(width, height, fontSize);

  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, 'pdf', 'compress,garbage=2,fonts=subset');

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
    try {
      writer.destroy();
    } catch (e) {}
    try {
      buf.destroy();
    } catch (e) {}
    try {
      doc.destroy();
    } catch (e) {}
  }
}
