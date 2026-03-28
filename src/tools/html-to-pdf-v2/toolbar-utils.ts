export const isCursorInLink = (): boolean => {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode) return false;

  let node: Node | null = selection.anchorNode;
  while (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

  const element = node as Element;
  return !!element.closest('a');
};

export const updateToolbarState = (): void => {
  const blockFormat = getCurrentBlockFormat();
  const isHeading = blockFormat && /^h[1-6]$/.test(blockFormat.tag);

  const buttons: Record<string, string> = {
    'btn-bold': 'bold',
    'btn-italic': 'italic',
    'btn-underline': 'underline',
    'btn-strike': 'strikeThrough',
    'btn-sup': 'superscript',
    'btn-sub': 'subscript',
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
        } else if (cmd === 'underline' && isCursorInLink()) {
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

  const linkBtn = document.getElementById('btn-link');
  if (linkBtn) {
    const isInLink = isCursorInLink();
    linkBtn.classList.toggle('btn-active', isInLink);
    linkBtn.classList.toggle('btn-ghost', !isInLink);
  }

  // Update color indicators
  const foreColorValue = document.queryCommandValue('foreColor');
  const foreColorHex = colorStringToHex(foreColorValue);
  updateColorIndicator('forecolor-indicator', foreColorHex);

  const hiliteColorValue = document.queryCommandValue('hiliteColor');
  const hiliteColorHex = colorStringToHex(hiliteColorValue);
  updateColorIndicator('hilitecolor-indicator', hiliteColorHex);
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
  if (!isSelectionInEditor()) {
    return;
  }
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

const rgbToHex = (r: number, g: number, b: number): string => {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
      .toUpperCase()
  );
};

const colorStringToHex = (colorString: string): string => {
  if (!colorString || colorString === 'transparent' || colorString === 'rgba(0, 0, 0, 0)') {
    return 'transparent';
  }
  // Handle rgb(r, g, b) format
  const rgbMatch = colorString.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return rgbToHex(r, g, b);
  }
  // Handle hex format
  if (colorString.startsWith('#')) {
    return colorString.toUpperCase();
  }
  // Return black as default
  return '#000000';
};

const updateColorIndicator = (indicatorId: string, hexColor: string): void => {
  const indicator = document.getElementById(indicatorId);
  if (!indicator) return;
  if (hexColor === 'transparent') {
    indicator.style.backgroundColor = 'transparent';
    indicator.style.border = '1px solid #ccc';
  } else {
    indicator.style.backgroundColor = hexColor;
    indicator.style.border = 'none';
  }
};

const applyColor = (command: 'foreColor' | 'hiliteColor', hex: string): void => {
  if (hex === 'transparent') {
    document.execCommand('removeFormat', false);
    // For background color, also set to transparent (remove highlight)
    if (command === 'hiliteColor') {
      document.execCommand('hiliteColor', false, 'transparent');
    }
    // For foreColor, removeFormat already removes color formatting
  } else {
    document.execCommand(command, false, hex);
  }
  updateToolbarState();
  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();
  }
};

const clearFormatting = (): void => {
  if (!isSelectionInEditor()) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  let range = selection.getRangeAt(0);

  // If selection is collapsed (just a cursor), expand to include one character forward
  if (range.collapsed) {
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;

    // Check if there's a next character in the same text node
    if (startContainer.nodeType === Node.TEXT_NODE) {
      const textLength = startContainer.textContent?.length || 0;
      if (startOffset < textLength) {
        // Expand range to include the next character
        range = document.createRange();
        range.setStart(startContainer, startOffset);
        range.setEnd(startContainer, startOffset + 1);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // At the end of a text node, try to move to previous character
        if (startOffset > 0) {
          range = document.createRange();
          range.setStart(startContainer, startOffset - 1);
          range.setEnd(startContainer, startOffset);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Empty text node? Just return.
          return;
        }
      }
    } else {
      // Not a text node, maybe an element node. Try to select the first child text node.
      const child = startContainer.childNodes[startOffset];
      if (child && child.nodeType === Node.TEXT_NODE) {
        range = document.createRange();
        range.setStart(child, 0);
        range.setEnd(child, Math.min(1, child.textContent?.length || 0));
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        return;
      }
    }
  }

  // Now we have a non-collapsed selection
  // Remove all formatting from the selection
  document.execCommand('removeFormat', false);

  // Collapse selection to end (after the cleared region)
  selection.collapseToEnd();

  updateToolbarState();
  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();
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
    .getElementById('btn-sup')
    ?.addEventListener('click', () => execFormatCommand('superscript'));
  document
    .getElementById('btn-sub')
    ?.addEventListener('click', () => execFormatCommand('subscript'));
  document.getElementById('btn-clear')?.addEventListener('click', clearFormatting);

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

  // Color swatch listeners
  const setupColorDropdown = (
    dropdownId: string,
    command: 'foreColor' | 'hiliteColor',
    indicatorId: string
  ) => {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        const color = (e.target as HTMLElement).dataset.color;
        if (color) {
          applyColor(command, color);
          updateColorIndicator(indicatorId, color);
          // Close dropdown by blurring the label
          const label = dropdown.previousElementSibling as HTMLLabelElement;
          if (label) label.blur();
        }
      });
    });
    const picker = dropdown.querySelector(`input[type="color"]`) as HTMLInputElement;
    if (picker) {
      picker.addEventListener('input', (e) => {
        const color = (e.target as HTMLInputElement).value;
        applyColor(command, color.toUpperCase());
        updateColorIndicator(indicatorId, color.toUpperCase());
      });
    }
    const removeBtn = dropdown.querySelector('button[id$="-remove"]') as HTMLButtonElement;
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        applyColor(command, 'transparent');
        updateColorIndicator(indicatorId, 'transparent');
      });
    }
  };

  setupColorDropdown('forecolor-dropdown', 'foreColor', 'forecolor-indicator');
  setupColorDropdown('hilitecolor-dropdown', 'hiliteColor', 'hilitecolor-indicator');

  document.addEventListener('selectionchange', () => {
    if (isSelectionInEditor()) {
      updateToolbarState();
    }
  });
};
