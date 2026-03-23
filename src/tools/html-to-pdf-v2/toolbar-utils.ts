export const execFormatCommand = (command: string, value?: string): void => {
  if (value) {
    document.execCommand(command, false, value);
  } else {
    document.execCommand(command, false);
  }
  updateToolbarState();
};

export const execBlockFormat = (tag: string): void => {
  document.execCommand('formatBlock', false, tag);
  updateToolbarState();
};

export const updateToolbarState = (): void => {
  const buttons: Record<string, string> = {
    'btn-bold': 'bold',
    'btn-italic': 'italic',
    'btn-underline': 'underline',
    'btn-strike': 'strikeThrough',
    'btn-ul': 'insertUnorderedList',
    'btn-ol': 'insertOrderedList',
    'btn-align-left': 'justifyLeft',
    'btn-align-center': 'justifyCenter',
    'btn-align-right': 'justifyRight',
    'btn-align-justify': 'justifyFull',
  };

  for (const [btnId, cmd] of Object.entries(buttons)) {
    const btn = document.getElementById(btnId);
    if (btn) {
      try {
        const state = document.queryCommandState(cmd);
        btn.classList.toggle('btn-active', state);
        btn.classList.toggle('btn-ghost', !state);
      } catch {
        btn.classList.remove('btn-active');
        btn.classList.add('btn-ghost');
      }
    }
  }
};

export const isSelectionInEditor = (): boolean => {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode) return false;

  let node: Node | null = selection.anchorNode;
  while (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  const editor = document.getElementById('editor');
  return !!(node && editor && (node === editor || editor.contains(node)));
};

export const setupToolbarListeners = (): void => {
  document.getElementById('btn-bold')?.addEventListener('click', () => execFormatCommand('bold'));
  document
    .getElementById('btn-italic')
    ?.addEventListener('click', () => execFormatCommand('italic'));
  document
    .getElementById('btn-underline')
    ?.addEventListener('click', () => execFormatCommand('underline'));
  document
    .getElementById('btn-strike')
    ?.addEventListener('click', () => execFormatCommand('strikeThrough'));
  document
    .getElementById('btn-clear')
    ?.addEventListener('click', () => execFormatCommand('removeFormat'));

  document.getElementById('heading-select')?.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) {
      execBlockFormat(value);
      (e.target as HTMLSelectElement).value = '';
    }
  });

  document
    .getElementById('btn-ul')
    ?.addEventListener('click', () => execFormatCommand('insertUnorderedList'));
  document
    .getElementById('btn-ol')
    ?.addEventListener('click', () => execFormatCommand('insertOrderedList'));

  document
    .getElementById('btn-align-left')
    ?.addEventListener('click', () => execFormatCommand('justifyLeft'));
  document
    .getElementById('btn-align-center')
    ?.addEventListener('click', () => execFormatCommand('justifyCenter'));
  document
    .getElementById('btn-align-right')
    ?.addEventListener('click', () => execFormatCommand('justifyRight'));
  document
    .getElementById('btn-align-justify')
    ?.addEventListener('click', () => execFormatCommand('justifyFull'));

  document
    .getElementById('btn-blockquote')
    ?.addEventListener('click', () => execBlockFormat('blockquote'));
  document.getElementById('btn-code')?.addEventListener('click', () => execBlockFormat('pre'));

  document.addEventListener('selectionchange', () => {
    if (isSelectionInEditor()) {
      updateToolbarState();
    }
  });
};
