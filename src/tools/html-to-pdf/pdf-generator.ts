export const PageSizes: { [key: string]: [number, number] } = {
  A0: [2383.94, 3370.39],
  A1: [1683.78, 2383.94],
  A2: [1190.55, 1683.78],
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  A6: [297.64, 419.53],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
};

export interface PageSettings {
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  margin: number;
}

export const getPageSettings = (): PageSettings => {
  const pageSizeSelect = document.getElementById('page-size') as HTMLSelectElement;
  const orientationSelect = document.getElementById('page-orientation') as HTMLSelectElement;
  const customWidthInput = document.getElementById('custom-width') as HTMLInputElement;
  const customHeightInput = document.getElementById('custom-height') as HTMLInputElement;
  const fontSizeInput = document.getElementById('font-size') as HTMLInputElement;
  const fontFamilySelect = document.getElementById('font-family') as HTMLSelectElement;
  const marginInput = document.getElementById('margin-size') as HTMLInputElement;

  const sizeKey = pageSizeSelect?.value || 'A4';
  const orientation = orientationSelect?.value || 'portrait';

  let dimensions: [number, number];

  if (sizeKey === 'Custom') {
    dimensions = [
      parseFloat(customWidthInput?.value) || 595,
      parseFloat(customHeightInput?.value) || 842,
    ];
  } else {
    dimensions = PageSizes[sizeKey] || PageSizes['A4'];
  }

  if (orientation === 'landscape') {
    dimensions = [dimensions[1], dimensions[0]];
  }

  return {
    width: dimensions[0],
    height: dimensions[1],
    fontSize: parseInt(fontSizeInput?.value || '12'),
    fontFamily: fontFamilySelect?.value || 'sans-serif',
    margin: parseInt(marginInput?.value || '20'),
  };
};

const MIN_IMAGE_WIDTH_PERCENT = 5;

const getRenderedImageWidths = (editorHost: HTMLElement | null): number[] => {
  if (!editorHost) {
    return [];
  }

  const editorContent = editorHost.querySelector<HTMLElement>('[data-editor-content]');
  if (!editorContent) {
    return [];
  }

  const contentWidth = editorContent.getBoundingClientRect().width;
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) {
    return [];
  }

  return Array.from(editorContent.querySelectorAll<HTMLImageElement>('img')).map((image) => {
    const imageWidth = image.getBoundingClientRect().width || image.width || image.naturalWidth;
    const percent = (imageWidth / contentWidth) * 100;
    return Math.min(100, Math.max(MIN_IMAGE_WIDTH_PERCENT, percent));
  });
};

export const normalizeImagesForPdf = (
  htmlContent: string,
  editorHost: HTMLElement | null,
  pageWidth: number,
  pageMargin: number
): string => {
  const imageWidths = getRenderedImageWidths(editorHost);
  if (!imageWidths.length) {
    return htmlContent;
  }

  const parser = new DOMParser();
  const htmlDocument = parser.parseFromString(`<body>${htmlContent}</body>`, 'text/html');

  const imageContainers = Array.from(
    htmlDocument.body.querySelectorAll<HTMLElement>('.editor-image-container')
  );

  imageContainers.forEach((container) => {
    container.querySelectorAll('.editor-image-container__handle').forEach((handle) => {
      handle.remove();
    });

    const wrappedImages = Array.from(container.querySelectorAll('img'));
    if (!wrappedImages.length) {
      container.remove();
      return;
    }

    wrappedImages.forEach((wrappedImage) => {
      container.parentNode?.insertBefore(wrappedImage, container);
    });

    container.remove();
  });

  const images = Array.from(htmlDocument.body.querySelectorAll<HTMLImageElement>('img'));

  if (!images.length) {
    return htmlContent;
  }

  const pageContentWidth = pageWidth - pageMargin * 2;

  images.forEach((image, index) => {
    const widthPercent = imageWidths[index];
    if (!widthPercent) {
      return;
    }

    const widthPt = (widthPercent / 100) * pageContentWidth;
    image.style.width = `${widthPt.toFixed(2)}pt`;
    image.style.height = 'auto';
    image.removeAttribute('width');
    image.removeAttribute('height');
  });

  return htmlDocument.body.innerHTML;
};

const getBaseCss = (settings: PageSettings): string => {
  return `
* { box-sizing: border-box; }
body {
  font-family: ${settings.fontFamily};
  font-size: ${settings.fontSize}pt;
  line-height: 1.4;
  color: #000;
  margin: ${settings.margin}pt;
  padding: 0;
}
h1 { font-size: 24pt; font-weight: bold; margin: 18pt 0 12pt 0; }
h2 { font-size: 20pt; font-weight: bold; margin: 16pt 0 10pt 0; }
h3 { font-size: 16pt; font-weight: bold; margin: 14pt 0 8pt 0; }
h4 { font-size: 14pt; font-weight: bold; margin: 12pt 0 6pt 0; }
h5 { font-size: 12pt; font-weight: bold; margin: 10pt 0 5pt 0; }
h6 { font-size: 11pt; font-weight: bold; margin: 9pt 0 4pt 0; }
p { margin: 8pt 0; }
blockquote {
  margin: 12pt 20pt;
  padding: 8pt 16pt;
  border-left: 4pt solid #ddd;
  background: #f9f9f9;
  font-style: italic;
}
pre, code {
  background: #f5f5f5;
  border: 1pt solid #ddd;
  padding: 8pt;
  font-family: monospace;
  font-size: 10pt;
  border-radius: 3pt;
}
pre { white-space: pre-wrap; word-wrap: break-word; }
ul, ol { margin: 8pt 0; padding-left: 25pt; }
li { margin: 4pt 0; }
a { color: #0066cc; text-decoration: underline; }
img { display: block; max-width: 100%; height: auto; margin: 8pt 0; page-break-inside: avoid; break-inside: avoid; }
.editor-image-container { display: block; max-width: 100%; margin: 8pt 0; }
.editor-image-container img { display: block; max-width: 100%; }
strong, b { font-weight: bold; }
em, i { font-style: italic; }
u { text-decoration: underline; }
s, strike { text-decoration: line-through; }
`;
};

export const wrapHtmlForPdf = (
  htmlContent: string,
  settings: PageSettings = getPageSettings()
): string => {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${getBaseCss(settings)}
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;
};
