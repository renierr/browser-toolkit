export const isDev = Boolean(import.meta.env.DEV);

export const fuzzyScore = (text: string, term: string): number => {
  if (term === '') return 0;
  text = text.toLowerCase();
  term = term.toLowerCase();

  let score = 0;
  let termIndex = 0;

  for (const char of text) {
    if (char === term[termIndex]) {
      score += 1 - termIndex * 0.1;
      termIndex++;
      if (termIndex === term.length) return score;
    }
  }
  return termIndex === term.length ? score : -Infinity;
};

function getValueByDotNotation(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && current.hasOwnProperty(key)) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  if (current === undefined || current === null) {
    return undefined;
  }
  return String(current);
}

export const replacePlaceholders = (templateHtml: string, context: any): string => {
  const placeholderRegex = /\{\{(.+?)\}\}/g;

  let output = templateHtml;

  output = output.replace(placeholderRegex, (match, keyPath) => {
    const trimmedPath = keyPath.trim();
    const value = getValueByDotNotation(context, trimmedPath);

    if (value !== undefined) {
      return value;
    } else {
      console.warn(`Placeholder not found in context: ${match}`);
      return `[${match} NOT FOUND]`;
    }
  });
  return output;
};
