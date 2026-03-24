const DANGEROUS_TAGS = ['script', 'style', 'object', 'embed', 'iframe', 'form'];

const DANGEROUS_ATTRS = [
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'oninput',
];

const DANGEROUS_PROTOCOLS = ['javascript:', 'data:text/html'];

export const sanitizeHtml = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  DANGEROUS_TAGS.forEach((tag) => {
    const elements = doc.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  });

  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrs = Array.from(el.attributes);
    attrs.forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (DANGEROUS_ATTRS.some((dangerous) => name.startsWith(dangerous))) {
        el.removeAttribute(attr.name);
      }
    });

    const href = el.getAttribute('href');
    if (href && DANGEROUS_PROTOCOLS.some((p) => href.toLowerCase().startsWith(p))) {
      el.removeAttribute('href');
    }

    const src = el.getAttribute('src');
    if (src && DANGEROUS_PROTOCOLS.some((p) => src.toLowerCase().startsWith(p))) {
      el.removeAttribute('src');
    }

    const dataAttrs = Array.from(el.attributes).filter((attr) => attr.name.startsWith('data-'));
    dataAttrs.forEach((attr) => {
      const value = attr.value;
      if (DANGEROUS_PROTOCOLS.some((p) => value.toLowerCase().startsWith(p))) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
};
