export const updateToolbarState = (): void => {
  const blockFormat = getCurrentBlockFormat();
  const isHeading = blockFormat && /^h[1-6]$/.test(blockFormat.tag);

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
        let state = false;
        if (cmd === 'bold' && isHeading) {
          state = false;
        } else {
          state = document.queryCommandState(cmd);
        }
        btn.classList.toggle('btn-active', state);
        btn.classList.toggle('btn-ghost', !state);
      } catch {
        btn.classList.remove('btn-active');
        btn.classList.add('btn-ghost');
      }
    }
  }

  const headingSelect = document.getElementById('heading-select') as HTMLSelectElement;
  if (headingSelect) {
    if (blockFormat && /^h[1-6]$/.test(blockFormat.tag)) {
      headingSelect.value = blockFormat.tag;
    } else {
      headingSelect.value = '';
    }
  }

  const blockquoteBtn = document.getElementById('btn-blockquote');
  const codeBtn = document.getElementById('btn-code');
  if (blockquoteBtn) {
    const isBlockquote = blockFormat?.tag === 'blockquote';
    blockquoteBtn.classList.toggle('btn-active', isBlockquote);
    blockquoteBtn.classList.toggle('btn-ghost', !isBlockquote);
  }
  if (codeBtn) {
    const isCode = blockFormat?.tag === 'pre';
    codeBtn.classList.toggle('btn-active', isCode);
    codeBtn.classList.toggle('btn-ghost', !isCode);
  }
};

export const restoreEditorFocus = (): void => {
  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();
  }
};

export const saveSelection = (): Range | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return selection.getRangeAt(0).cloneRange();
};

export const restoreSelection = (range: Range): void => {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
};

export const getCurrentBlockFormat = (): { tag: string; level?: number } | null => {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode) return null;

  let node: Node | null = selection.anchorNode;
  while (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tagName)) {
    return { tag: tagName, level: parseInt(tagName[1]) };
  }

  if (tagName === 'blockquote') {
    return { tag: 'blockquote' };
  }

  if (tagName === 'pre' || (tagName === 'code' && element.closest('pre'))) {
    return { tag: 'pre' };
  }

  if (tagName === 'ul') {
    return { tag: 'ul' };
  }

  if (tagName === 'ol') {
    return { tag: 'ol' };
  }

  return null;
};

export const execFormatCommand = (command: string, value?: string): void => {
  if (value) {
    document.execCommand(command, false, value);
  } else {
    document.execCommand(command, false);
  }
  updateToolbarState();
  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();
  }
};

export const execBlockFormat = (tag: string): void => {
  const currentBlock = getCurrentBlockFormat();
  if (currentBlock?.tag === tag) {
    document.execCommand('formatBlock', false, 'p');
  } else {
    document.execCommand('formatBlock', false, tag);
  }
  setTimeout(() => {
    updateToolbarState();
    const editor = document.getElementById('editor');
    if (editor) {
      editor.focus();
    }
  }, 0);
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
    restoreEditorFocus();
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
