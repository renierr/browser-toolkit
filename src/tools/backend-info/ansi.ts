type AnsiStyleState = {
  fg?: string;
  bg?: string;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
};

function createDefaultAnsiState(): AnsiStyleState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
  };
}

function ansiColor(code: number): string | undefined {
  const colors: Record<number, string> = {
    30: '#111827',
    31: '#ef4444',
    32: '#22c55e',
    33: '#f59e0b',
    34: '#3b82f6',
    35: '#d946ef',
    36: '#06b6d4',
    37: '#e5e7eb',
    90: '#6b7280',
    91: '#f87171',
    92: '#4ade80',
    93: '#fbbf24',
    94: '#60a5fa',
    95: '#e879f9',
    96: '#22d3ee',
    97: '#f9fafb',
  };
  return colors[code];
}

function applyAnsiCode(state: AnsiStyleState, code: number): void {
  if (code === 0) {
    state.fg = undefined;
    state.bg = undefined;
    state.bold = false;
    state.dim = false;
    state.italic = false;
    state.underline = false;
    return;
  }
  if (code === 1) {
    state.bold = true;
    return;
  }
  if (code === 2) {
    state.dim = true;
    return;
  }
  if (code === 3) {
    state.italic = true;
    return;
  }
  if (code === 4) {
    state.underline = true;
    return;
  }
  if (code === 22) {
    state.bold = false;
    state.dim = false;
    return;
  }
  if (code === 23) {
    state.italic = false;
    return;
  }
  if (code === 24) {
    state.underline = false;
    return;
  }
  if (code === 39) {
    state.fg = undefined;
    return;
  }
  if (code === 49) {
    state.bg = undefined;
    return;
  }
  if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
    state.fg = ansiColor(code);
    return;
  }
  if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
    state.bg = ansiColor(code - 10);
  }
}

function appendAnsiTextSegment(
  fragment: DocumentFragment,
  text: string,
  state: AnsiStyleState
): void {
  if (text.length === 0) {
    return;
  }
  const cleanText = text.replace(/\u001b/g, '');
  if (cleanText.length === 0) {
    return;
  }

  const span = document.createElement('span');
  span.textContent = cleanText;
  if (state.fg) span.style.color = state.fg;
  if (state.bg) span.style.backgroundColor = state.bg;
  if (state.bold) span.style.fontWeight = '700';
  if (state.dim) span.style.opacity = '0.75';
  if (state.italic) span.style.fontStyle = 'italic';
  if (state.underline) span.style.textDecoration = 'underline';
  fragment.appendChild(span);
}

export function renderAnsiLogLine(line: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const state = createDefaultAnsiState();
  const ansiPattern = /(?:\u001b\[|\x1b\[|\[(?=\d+(?:;\d+)*m))(\d*(?:;\d+)*)m/g;

  let cursor = 0;
  let match = ansiPattern.exec(line);
  while (match) {
    const index = match.index;
    appendAnsiTextSegment(fragment, line.slice(cursor, index), state);

    const payload = match[1] || '0';
    const codes = payload.split(';').map((value) => Number.parseInt(value, 10));
    for (const code of codes) {
      if (Number.isFinite(code)) {
        applyAnsiCode(state, code);
      }
    }

    cursor = index + match[0].length;
    match = ansiPattern.exec(line);
  }

  appendAnsiTextSegment(fragment, line.slice(cursor), state);
  return fragment;
}
