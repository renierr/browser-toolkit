
/**
 * Parses a PDF date string (e.g., D:20221008012831+00'00') into a readable format.
 */
export function formatPdfDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  if (!dateStr.startsWith('D:')) return dateStr;

  // Regex for D:YYYYMMDDHHmmSSOHH'mm'
  const regex = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?'?/;
  const match = dateStr.match(regex);

  if (!match) return dateStr;

  const [, year, month, day, hour, minute, second, offsetSign, offsetHour, offsetMinute] = match;

  let formatted = `${year}-${month}-${day} ${hour}:${minute}`;
  if (second) formatted += `:${second}`;

  if (offsetSign) {
    if (offsetSign === 'Z') {
      formatted += ' UTC';
    } else {
      formatted += ` ${offsetSign}${offsetHour || '00'}:${offsetMinute || '00'}`;
    }
  }

  return formatted;
}

/**
 * Parses XMP metadata string into a structured object.
 * Handles namespaces, sequences (rdf:Seq/Bag/Alt), and nested resources.
 */
export function parseXmpMetadata(xmpString: string): Record<string, any> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmpString, 'text/xml');
  const results: Record<string, any> = {};

  const getLocalName = (node: Node) => {
    if ((node as any).localName) return (node as any).localName;
    const parts = node.nodeName.split(':');
    return parts[parts.length - 1];
  };

  const parseNode = (node: Node): any => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue?.trim() || null;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as Element;
    const localName = getLocalName(element);

    if (['Seq', 'Bag', 'Alt'].includes(localName)) {
      const items: any[] = [];
      for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes[i];
        if (child.nodeType === Node.ELEMENT_NODE && getLocalName(child) === 'li') {
          const val = parseNode(child);
          if (val !== null) items.push(val);
        }
      }
      return items;
    }

    if (element.childNodes.length > 0 || element.attributes.length > 0) {
      let hasElements = false;
      const obj: Record<string, any> = {};
      let textContent = '';

      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (!attr.name.startsWith('xmlns') && !attr.name.startsWith('rdf:')) {
          obj[`@${attr.name}`] = attr.value;
        }
      }

      for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes[i];
        if (child.nodeType === Node.ELEMENT_NODE) {
          hasElements = true;
          const name = child.nodeName;
          const value = parseNode(child);
          if (value !== null) {
            if (obj[name]) {
              if (!Array.isArray(obj[name])) obj[name] = [obj[name]];
              obj[name].push(value);
            } else {
              obj[name] = value;
            }
          }
        } else if (child.nodeType === Node.TEXT_NODE) {
          textContent += child.nodeValue?.trim() || '';
        }
      }

      if (!hasElements && Object.keys(obj).length === 0) return textContent || null;
      return Object.keys(obj).length > 0 ? obj : textContent;
    }

    return null;
  };

  const descriptions = xmlDoc.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'Description');
  for (let i = 0; i < descriptions.length; i++) {
    const desc = descriptions[i];
    const parsed = parseNode(desc);
    if (parsed && typeof parsed === 'object') {
      Object.assign(results, parsed);
    }
  }

  return results;
}

/**
 * Flattens a nested XMP object into a list of readable key-value pairs.
 * Detects embedded images and returns them as structured objects.
 */
export function flattenXmpMetadata(obj: any, prefix = ''): Record<string, any> {
  let results: Record<string, any> = {};

  for (const key in obj) {
    const value = obj[key];
    const cleanKey = key.replace(/[a-zA-Z0-9]+:/g, '').replace(/^@/, '');
    const displayKey = prefix ? `${prefix} > ${cleanKey}` : cleanKey;

    if (typeof value === 'string' && value.length > 100 && (key.toLowerCase().includes('image') || key.toLowerCase().includes('thumbnail'))) {
      results[displayKey] = {
        type: 'image',
        data: value.replace(/\s/g, ''),
        format: (obj['xmpGImg:format'] || obj['format'] || 'jpeg').toLowerCase()
      };
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          Object.assign(results, flattenXmpMetadata(item, `${displayKey} [${index + 1}]`));
        } else {
          results[`${displayKey} [${index + 1}]`] = formatPdfDate(String(item));
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(results, flattenXmpMetadata(value, displayKey));
    } else {
      results[displayKey] = formatPdfDate(String(value));
    }
  }

  return results;
}

export const setPdfViewerOptions = (viewerWindow: Window, options: {}) => {
  const win = viewerWindow as any;
  if (win?.PDFViewerApplicationOptions) {
    win?.PDFViewerApplicationOptions.setAll(options);
  } else {
    console.warn(
      'PDFViewerApplicationOptions not found in PDF viewer window. Can not set any options'
    );
  }
};

type PdfViewerHandler = (viewerWindow: Window, evt?: Event) => void;
const pdfViewerHandlers = new Set<PdfViewerHandler>();

export function onPdfViewerLoaded(fn: PdfViewerHandler): () => void {
  pdfViewerHandlers.add(fn);
  return () => {
    pdfViewerHandlers.delete(fn);
  };
}

export function offPdfViewerLoaded(fn: PdfViewerHandler): boolean {
  return pdfViewerHandlers.delete(fn);
}

export function setupGlobalWebViewerDelegate() {
  const marker = '__webviewer_delegate_installed' as any;
  if ((window as any)[marker]) return;
  (window as any)[marker] = true;

  document.addEventListener('webviewerloaded', (evt: any) => {
    const viewerWin = evt?.detail?.source ?? null;
    if (!viewerWin) return;

    for (const h of Array.from(pdfViewerHandlers)) {
      try {
        h(viewerWin, evt);
      } catch (err) {
        console.error('webviewer handler failed', err);
      }
    }
  });
}

