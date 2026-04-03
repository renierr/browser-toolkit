type BlockFormat = {
  readonly tag: string;
  readonly level?: number;
};

export type HtmlEditorOptions = {
  readonly editor: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly imageInput?: HTMLInputElement | null;
  readonly sanitizeHtml?: (html: string) => string;
  readonly onContentChange?: () => void;
  readonly onToolbarStateChange?: () => void;
  readonly onEditorKeyDown?: (event: KeyboardEvent) => boolean | void;
};

export class HtmlEditor {
  private readonly editor: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly imageInput: HTMLInputElement | null;
  private readonly sanitizeHtml?: (html: string) => string;
  private readonly onContentChange?: () => void;
  private readonly onToolbarStateChange?: () => void;
  private readonly onEditorKeyDown?: (event: KeyboardEvent) => boolean | void;
  private readonly doc: Document;

  private readonly disposers: Array<() => void> = [];
  private readonly imageContainerDisposers = new Map<HTMLElement, () => void>();

  private imageDebounce: number | undefined;
  private imageObserver: MutationObserver | null = null;
  private lastBlockTag = '';

  constructor(options: HtmlEditorOptions) {
    this.editor = options.editor;
    this.toolbar = options.toolbar;
    this.imageInput = options.imageInput ?? null;
    this.sanitizeHtml = options.sanitizeHtml;
    this.onContentChange = options.onContentChange;
    this.onToolbarStateChange = options.onToolbarStateChange;
    this.onEditorKeyDown = options.onEditorKeyDown;
    this.doc = this.editor.ownerDocument;
  }

  mount(): void {
    this.setupToolbarListeners();
    this.setupEditorListeners();
    this.ensureEditorContent();
    this.setupAllImages();
    this.updateToolbarState();
    this.emitContentChange();
    this.focus();
  }

  destroy(): void {
    this.disposers.forEach((dispose) => {
      dispose();
    });
    this.disposers.length = 0;

    this.imageContainerDisposers.forEach((dispose) => {
      dispose();
    });
    this.imageContainerDisposers.clear();

    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }

    if (this.imageDebounce) {
      window.clearTimeout(this.imageDebounce);
      this.imageDebounce = undefined;
    }
  }

  focus(): void {
    this.editor.focus();
  }

  setHtml(html: string): void {
    this.editor.innerHTML = this.sanitizeHtml ? this.sanitizeHtml(html) : html;
    this.ensureEditorContent();
    this.setupAllImages();
    this.updateToolbarState();
    this.emitContentChange();
  }

  getHtml(): string {
    return this.editor.innerHTML;
  }

  getCleanHtml(): string {
    const clone = this.editor.cloneNode(true) as HTMLElement;

    const containers = clone.querySelectorAll('.editor-image-container');
    containers.forEach((container) => {
      const handle = container.querySelector('.editor-image-container__handle');
      handle?.remove();
      container.classList.remove('editor-image-container--selected');
      container.classList.remove('editor-image-container--dragging');
      container.removeAttribute('data-image-setup');
    });

    const fontElements = clone.querySelectorAll('font');
    fontElements.forEach((font) => {
      const span = this.doc.createElement('span');

      for (let index = 0; index < font.attributes.length; index += 1) {
        const attr = font.attributes[index];
        span.setAttribute(attr.name, attr.value);
      }

      const color = font.getAttribute('color');
      if (color) {
        span.style.color = color;
        span.removeAttribute('color');
      }

      const face = font.getAttribute('face');
      if (face) {
        span.style.fontFamily = face;
        span.removeAttribute('face');
      }

      const size = font.getAttribute('size');
      if (size) {
        const sizeMap: Record<string, string> = {
          '1': 'xx-small',
          '2': 'x-small',
          '3': 'small',
          '4': 'medium',
          '5': 'large',
          '6': 'x-large',
          '7': 'xx-large',
        };

        const cssSize = sizeMap[size];
        if (cssSize) {
          span.style.fontSize = cssSize;
          span.removeAttribute('size');
        }
      }

      while (font.firstChild) {
        span.appendChild(font.firstChild);
      }

      font.parentNode?.replaceChild(span, font);
    });

    return clone.innerHTML;
  }

  refreshToolbarState(): void {
    this.updateToolbarState();
  }

  promptForLink(): void {
    this.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const anchorNode = selection.anchorNode;
    const existingLink = anchorNode?.parentElement?.closest('a') as HTMLAnchorElement | null;

    if (existingLink) {
      const currentUrl = existingLink.href;
      const newUrl = window.prompt('Edit link URL:', currentUrl);
      if (newUrl === null) {
        return;
      }

      if (newUrl.trim() === '') {
        const parent = existingLink.parentNode;
        while (existingLink.firstChild) {
          parent?.insertBefore(existingLink.firstChild, existingLink);
        }
        parent?.removeChild(existingLink);
      } else {
        existingLink.href = newUrl;
      }

      this.updateToolbarState();
      this.emitContentChange();
      return;
    }

    const url = window.prompt('Enter URL:');
    if (!url) {
      return;
    }

    this.execFormatCommand('createLink', url);
  }

  promptForImageInsert(): void {
    if (!this.imageInput) {
      return;
    }

    const handleChange = async (event: Event): Promise<void> => {
      const file = (event.target as HTMLInputElement).files?.[0];
      this.imageInput?.removeEventListener('change', handleChange);
      if (!file) {
        return;
      }

      try {
        const fileContent = await this.readFileAsDataUrl(file);
        this.insertImageToEditor(file, fileContent);
      } catch (error) {
        console.error('[HtmlEditor] Failed to load image:', error);
      } finally {
        if (this.imageInput) {
          this.imageInput.value = '';
        }
      }
    };

    this.imageInput.addEventListener('change', handleChange);
    this.imageInput.click();
  }

  private setupToolbarListeners(): void {
    this.bindToolbarCommand('btn-bold', 'bold');
    this.bindToolbarCommand('btn-italic', 'italic');
    this.bindToolbarCommand('btn-underline', 'underline');
    this.bindToolbarCommand('btn-strike', 'strikeThrough');
    this.bindToolbarCommand('btn-sup', 'superscript');
    this.bindToolbarCommand('btn-sub', 'subscript');

    const clearBtn = this.getById<HTMLButtonElement>('btn-clear');
    if (clearBtn) {
      this.bindEvent(clearBtn, 'click', () => this.clearFormatting());
    }

    const headingSelect = this.getById<HTMLSelectElement>('heading-select');
    if (headingSelect) {
      this.bindEvent(headingSelect, 'change', (event) => {
        const value = (event.target as HTMLSelectElement).value;
        if (value) {
          this.execBlockFormat(value);
          (event.target as HTMLSelectElement).value = '';
        }
        this.focus();
      });
    }

    this.bindToolbarCommand('btn-ul', 'insertUnorderedList');
    this.bindToolbarCommand('btn-ol', 'insertOrderedList');

    this.bindToolbarCommand('btn-align-left', 'justifyLeft');
    this.bindToolbarCommand('btn-align-center', 'justifyCenter');
    this.bindToolbarCommand('btn-align-right', 'justifyRight');
    this.bindToolbarCommand('btn-align-justify', 'justifyFull');

    const blockquoteBtn = this.getById<HTMLButtonElement>('btn-blockquote');
    if (blockquoteBtn) {
      this.bindEvent(blockquoteBtn, 'click', () => this.execBlockFormat('blockquote'));
    }

    const codeBtn = this.getById<HTMLButtonElement>('btn-code');
    if (codeBtn) {
      this.bindEvent(codeBtn, 'click', () => this.execBlockFormat('pre'));
    }

    this.setupColorDropdown('forecolor-dropdown', 'foreColor', 'forecolor-indicator');
    this.setupColorDropdown('hilitecolor-dropdown', 'hiliteColor', 'hilitecolor-indicator');

    const handleSelectionChange = (): void => {
      if (this.isSelectionInEditor()) {
        this.updateToolbarState();
      }
    };

    this.bindEvent(this.doc, 'selectionchange', handleSelectionChange);
  }

  private setupEditorListeners(): void {
    this.bindEvent(this.editor, 'input', () => {
      this.ensureEditorContent();
      this.emitContentChange();
    });

    this.bindEvent(this.editor, 'keydown', (event) =>
      this.onEditorKeyDownInternal(event as KeyboardEvent)
    );
    this.bindEvent(this.editor, 'keyup', () => this.updateToolbarState());
    this.bindEvent(this.editor, 'pointerup', () => this.updateToolbarState());
    this.bindEvent(this.editor, 'click', (event) =>
      this.handleEditorClick(event as MouseEvent | PointerEvent)
    );
    this.bindEvent(this.editor, 'pointerdown', (event) =>
      this.handleEditorClick(event as MouseEvent | PointerEvent)
    );
    this.bindEvent(this.editor, 'input', () => this.reSetupImages());
    this.bindEvent(this.editor, 'paste', (event) => this.handlePaste(event as ClipboardEvent));

    this.imageObserver = new MutationObserver(() => {
      this.reSetupImages();
    });

    this.imageObserver.observe(this.editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private onEditorKeyDownInternal(event: KeyboardEvent): void {
    if (this.onEditorKeyDown?.(event)) {
      return;
    }

    if (event.key === 'Enter') {
      const blockFormat = this.getCurrentBlockFormat();
      if (blockFormat && (blockFormat.tag === 'blockquote' || blockFormat.tag === 'pre')) {
        if (this.lastBlockTag === blockFormat.tag) {
          document.execCommand('formatBlock', false, 'p');
          this.lastBlockTag = '';
          window.setTimeout(() => {
            this.updateToolbarState();
          }, 0);
        } else {
          this.lastBlockTag = blockFormat.tag;
        }
      } else {
        this.lastBlockTag = '';
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      const selection = window.getSelection();
      if (!selection || !selection.anchorNode) {
        return;
      }

      const preEl =
        selection.anchorNode.nodeType === Node.TEXT_NODE
          ? (selection.anchorNode as Text).parentElement?.closest('pre')
          : null;
      const blockquoteEl =
        selection.anchorNode.nodeType === Node.TEXT_NODE
          ? (selection.anchorNode as Text).parentElement?.closest('blockquote')
          : null;
      const blockElement = preEl || blockquoteEl;

      if (blockElement && blockElement === blockElement.parentElement?.firstChild) {
        const range = selection.getRangeAt(0);
        if (range.startOffset === 0 && range.endOffset === 0) {
          event.preventDefault();
          const paragraph = this.doc.createElement('p');
          paragraph.innerHTML = '<br>';
          blockElement.parentNode?.insertBefore(paragraph, blockElement);

          const newRange = this.doc.createRange();
          newRange.setStart(paragraph, 0);
          newRange.setEnd(paragraph, 0);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }

      this.lastBlockTag = '';
      return;
    }

    if (event.key === 'ArrowDown') {
      const selection = window.getSelection();
      if (!selection || !selection.anchorNode) {
        return;
      }

      const preEl =
        selection.anchorNode.nodeType === Node.TEXT_NODE
          ? (selection.anchorNode as Text).parentElement?.closest('pre')
          : null;
      const blockquoteEl =
        selection.anchorNode.nodeType === Node.TEXT_NODE
          ? (selection.anchorNode as Text).parentElement?.closest('blockquote')
          : null;
      const blockElement = preEl || blockquoteEl;

      if (blockElement && blockElement === blockElement.parentElement?.lastChild) {
        event.preventDefault();
        const paragraph = this.doc.createElement('p');
        paragraph.innerHTML = '<br>';

        if (blockElement.nextSibling) {
          blockElement.parentNode?.insertBefore(paragraph, blockElement.nextSibling);
        } else {
          blockElement.parentNode?.appendChild(paragraph);
        }

        const newRange = this.doc.createRange();
        newRange.setStart(paragraph, 0);
        newRange.setEnd(paragraph, 0);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      this.lastBlockTag = '';
      return;
    }

    this.lastBlockTag = '';
  }

  private async handlePaste(event: ClipboardEvent): Promise<void> {
    event.preventDefault();

    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const imageFiles: File[] = [];

    if (clipboardData.files?.length) {
      for (const file of clipboardData.files) {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }
    }

    if (!imageFiles.length && clipboardData.items?.length) {
      for (const item of clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length) {
      for (const file of imageFiles) {
        try {
          const fileContent = await this.readFileAsDataUrl(file);
          this.insertImageToEditor(file, fileContent);
        } catch (error) {
          console.error('[HtmlEditor] Failed to paste image:', error);
        }
      }

      window.setTimeout(() => {
        this.reSetupImages();
      }, 150);

      return;
    }

    const html = clipboardData.getData('text/html');
    const text = clipboardData.getData('text/plain');

    if (html) {
      const safeHtml = this.sanitizeHtml ? this.sanitizeHtml(html) : html;
      const fragment = range.createContextualFragment(safeHtml);
      range.insertNode(fragment);
      range.collapse(false);
    } else if (text) {
      range.insertNode(this.doc.createTextNode(text));
      range.collapse(false);
    }

    this.emitContentChange();

    window.setTimeout(() => {
      this.reSetupImages();
    }, 150);
  }

  private bindToolbarCommand(id: string, command: string): void {
    const button = this.getById<HTMLButtonElement>(id);
    if (!button) {
      return;
    }

    this.bindEvent(button, 'click', () => {
      this.execFormatCommand(command);
    });
  }

  private getById<T extends HTMLElement>(id: string): T | null {
    const inToolbar = this.toolbar.querySelector<T>(`#${id}`);
    if (inToolbar) {
      return inToolbar;
    }

    return this.doc.getElementById(id) as T | null;
  }

  private bindEvent<T extends EventTarget>(
    target: T,
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    target.addEventListener(type, listener);
    this.disposers.push(() => {
      target.removeEventListener(type, listener);
    });
  }

  private emitContentChange(): void {
    this.onContentChange?.();
  }

  private emitToolbarStateChange(): void {
    this.onToolbarStateChange?.();
  }

  private ensureEditorContent(): void {
    if (!this.editor.innerHTML.trim()) {
      this.editor.innerHTML = '<p><br></p>';
    }
  }

  private execFormatCommand(command: string, value?: string): void {
    if (!this.isSelectionInEditor()) {
      return;
    }

    document.execCommand(command, false, value);
    this.updateToolbarState();
    this.focus();
    this.emitContentChange();
  }

  private execBlockFormat(tag: string): void {
    const currentBlock = this.getCurrentBlockFormat();

    if (currentBlock?.tag === tag) {
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand('formatBlock', false, tag);
    }

    window.setTimeout(() => {
      this.updateToolbarState();
      this.focus();
      this.emitContentChange();
    }, 0);
  }

  private isSelectionInEditor(): boolean {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return false;
    }

    let node: Node | null = selection.anchorNode;
    while (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    return Boolean(node && (node === this.editor || this.editor.contains(node)));
  }

  private getCurrentBlockFormat(): BlockFormat | null {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return null;
    }

    let node: Node | null = selection.anchorNode;
    while (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tagName)) {
      return {
        tag: tagName,
        level: Number.parseInt(tagName[1], 10),
      };
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
  }

  private isCursorInLink(): boolean {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return false;
    }

    let node: Node | null = selection.anchorNode;
    while (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return Boolean((node as Element).closest('a'));
  }

  private updateToolbarState(): void {
    const blockFormat = this.getCurrentBlockFormat();
    const isHeading = Boolean(blockFormat && /^h[1-6]$/.test(blockFormat.tag));

    const commandButtons: Record<string, string> = {
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

    Object.entries(commandButtons).forEach(([buttonId, command]) => {
      const button = this.getById<HTMLButtonElement>(buttonId);
      if (!button) {
        return;
      }

      try {
        let state = false;

        if (command === 'bold' && isHeading) {
          state = false;
        } else if (command === 'underline' && this.isCursorInLink()) {
          state = false;
        } else {
          state = document.queryCommandState(command);
        }

        button.classList.toggle('btn-active', state);
        button.classList.toggle('btn-ghost', !state);
      } catch (error) {
        console.error('[HtmlEditor] Failed to query command state:', error);
        button.classList.remove('btn-active');
        button.classList.add('btn-ghost');
      }
    });

    const headingSelect = this.getById<HTMLSelectElement>('heading-select');
    if (headingSelect) {
      headingSelect.value = blockFormat && /^h[1-6]$/.test(blockFormat.tag) ? blockFormat.tag : '';
    }

    const blockquoteButton = this.getById<HTMLButtonElement>('btn-blockquote');
    if (blockquoteButton) {
      const isBlockquote = blockFormat?.tag === 'blockquote';
      blockquoteButton.classList.toggle('btn-active', isBlockquote);
      blockquoteButton.classList.toggle('btn-ghost', !isBlockquote);
    }

    const codeButton = this.getById<HTMLButtonElement>('btn-code');
    if (codeButton) {
      const isCode = blockFormat?.tag === 'pre';
      codeButton.classList.toggle('btn-active', isCode);
      codeButton.classList.toggle('btn-ghost', !isCode);
    }

    const linkButton = this.getById<HTMLButtonElement>('btn-link');
    if (linkButton) {
      const isInLink = this.isCursorInLink();
      linkButton.classList.toggle('btn-active', isInLink);
      linkButton.classList.toggle('btn-ghost', !isInLink);
    }

    const foreColorValue = this.safeQueryCommandValue('foreColor');
    this.updateColorIndicator('forecolor-indicator', this.colorStringToHex(foreColorValue));

    const hiliteColorValue = this.safeQueryCommandValue('hiliteColor');
    this.updateColorIndicator('hilitecolor-indicator', this.colorStringToHex(hiliteColorValue));

    this.emitToolbarStateChange();
  }

  private safeQueryCommandValue(command: string): string {
    try {
      const value = document.queryCommandValue(command);
      return String(value ?? '');
    } catch {
      return '';
    }
  }

  private setupColorDropdown(
    dropdownId: string,
    command: 'foreColor' | 'hiliteColor',
    indicatorId: string
  ): void {
    const dropdown = this.getById<HTMLElement>(dropdownId);
    if (!dropdown) {
      return;
    }

    const swatches = dropdown.querySelectorAll<HTMLElement>('.color-swatch');
    swatches.forEach((swatch) => {
      this.bindEvent(swatch, 'click', (event) => {
        const color = (event.currentTarget as HTMLElement).dataset.color;
        if (!color) {
          return;
        }

        this.applyColor(command, color);
        this.updateColorIndicator(indicatorId, color);

        const label = dropdown.previousElementSibling as HTMLElement | null;
        label?.blur();
      });
    });

    const picker = dropdown.querySelector<HTMLInputElement>('input[type="color"]');
    if (picker) {
      this.bindEvent(picker, 'input', (event) => {
        const color = (event.target as HTMLInputElement).value.toUpperCase();
        this.applyColor(command, color);
        this.updateColorIndicator(indicatorId, color);
      });
    }

    const removeButton = dropdown.querySelector<HTMLButtonElement>('button[id$="-remove"]');
    if (removeButton) {
      this.bindEvent(removeButton, 'click', () => {
        this.applyColor(command, 'transparent');
        this.updateColorIndicator(indicatorId, 'transparent');
      });
    }
  }

  private applyColor(command: 'foreColor' | 'hiliteColor', hex: string): void {
    if (hex === 'transparent') {
      document.execCommand('removeFormat', false);
      if (command === 'hiliteColor') {
        document.execCommand('hiliteColor', false, 'transparent');
      }
    } else {
      document.execCommand(command, false, hex);
    }

    this.updateToolbarState();
    this.focus();
    this.emitContentChange();
  }

  private updateColorIndicator(indicatorId: string, hexColor: string): void {
    const indicator = this.getById<HTMLElement>(indicatorId);
    if (!indicator) {
      return;
    }

    if (hexColor === 'transparent') {
      indicator.style.backgroundColor = 'transparent';
      indicator.style.border = '1px solid #ccc';
      return;
    }

    indicator.style.backgroundColor = hexColor;
    indicator.style.border = 'none';
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((component) => {
          const hex = Math.round(Math.max(0, Math.min(255, component))).toString(16);
          return hex.length === 1 ? `0${hex}` : hex;
        })
        .join('')
        .toUpperCase()
    );
  }

  private colorStringToHex(colorString: string): string {
    if (!colorString || colorString === 'transparent' || colorString === 'rgba(0, 0, 0, 0)') {
      return 'transparent';
    }

    const rgbMatch = colorString.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      const r = Number.parseInt(rgbMatch[1], 10);
      const g = Number.parseInt(rgbMatch[2], 10);
      const b = Number.parseInt(rgbMatch[3], 10);
      return this.rgbToHex(r, g, b);
    }

    if (colorString.startsWith('#')) {
      return colorString.toUpperCase();
    }

    return '#000000';
  }

  private clearFormatting(): void {
    if (!this.isSelectionInEditor()) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    let range = selection.getRangeAt(0);

    if (range.collapsed) {
      const startContainer = range.startContainer;
      const startOffset = range.startOffset;

      if (startContainer.nodeType === Node.TEXT_NODE) {
        const textLength = startContainer.textContent?.length ?? 0;
        if (startOffset < textLength) {
          range = this.doc.createRange();
          range.setStart(startContainer, startOffset);
          range.setEnd(startContainer, startOffset + 1);
          selection.removeAllRanges();
          selection.addRange(range);
        } else if (startOffset > 0) {
          range = this.doc.createRange();
          range.setStart(startContainer, startOffset - 1);
          range.setEnd(startContainer, startOffset);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          return;
        }
      } else {
        const child = startContainer.childNodes[startOffset];
        if (!child || child.nodeType !== Node.TEXT_NODE) {
          return;
        }

        range = this.doc.createRange();
        range.setStart(child, 0);
        range.setEnd(child, Math.min(1, child.textContent?.length ?? 0));
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    document.execCommand('removeFormat', false);
    selection.collapseToEnd();

    this.updateToolbarState();
    this.focus();
    this.emitContentChange();
  }

  private handleEditorClick(event: MouseEvent | PointerEvent): void {
    const target = event.target as Node;
    const imageContainers = this.editor.querySelectorAll<HTMLElement>('.editor-image-container');

    imageContainers.forEach((container) => {
      if (!container.contains(target)) {
        container.classList.remove('editor-image-container--selected');
      }
    });
  }

  private selectImageContainer(container: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = this.doc.createRange();
    range.selectNode(container);
    selection.removeAllRanges();
    selection.addRange(range);

    container.classList.add('editor-image-container--selected');
  }

  private wrapImageInContainer(image: HTMLImageElement): HTMLElement {
    const container = this.doc.createElement('div');
    container.className = 'editor-image-container';
    container.setAttribute('contenteditable', 'false');

    const resizeHandle = this.doc.createElement('div');
    resizeHandle.className = 'editor-image-container__handle';

    image.parentNode?.insertBefore(container, image);
    container.appendChild(image);
    container.appendChild(resizeHandle);

    return container;
  }

  private setupImageResize(container: HTMLElement, image: HTMLImageElement): () => void {
    const resizeHandle = container.querySelector<HTMLElement>('.editor-image-container__handle');
    if (!resizeHandle) {
      return () => undefined;
    }

    container.setAttribute('draggable', 'true');
    image.removeAttribute('draggable');

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const startDrag = (): void => {
      container.classList.add('editor-image-container--dragging');
    };

    const endDrag = (): void => {
      container.classList.remove('editor-image-container--dragging');
    };

    const doResize = (event: PointerEvent): void => {
      if (!isResizing) {
        return;
      }

      const difference = event.clientX - startX;
      const width = Math.max(50, Math.min(startWidth + difference, 800));
      image.style.width = `${width}px`;
      image.style.maxWidth = 'none';
    };

    const stopResize = (event: PointerEvent): void => {
      if (!isResizing) {
        return;
      }

      isResizing = false;
      resizeHandle.removeEventListener('pointermove', doResize);
      resizeHandle.removeEventListener('pointerup', stopResize);
      resizeHandle.removeEventListener('pointercancel', stopResize);

      if (resizeHandle.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId);
      }
    };

    const startResize = (event: PointerEvent): void => {
      if (isResizing) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      isResizing = true;
      startX = event.clientX;
      startWidth = image.offsetWidth;

      resizeHandle.setPointerCapture(event.pointerId);
      resizeHandle.addEventListener('pointermove', doResize, { passive: false });
      resizeHandle.addEventListener('pointerup', stopResize, { passive: false });
      resizeHandle.addEventListener('pointercancel', stopResize, { passive: false });
    };

    const selectImage = (event: MouseEvent | PointerEvent): void => {
      event.stopPropagation();

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed || !container.contains(range.commonAncestorContainer)) {
          this.selectImageContainer(container);
        }
        return;
      }

      this.selectImageContainer(container);
    };

    container.addEventListener('dragstart', startDrag);
    container.addEventListener('dragend', endDrag);
    resizeHandle.addEventListener('pointerdown', startResize);
    container.addEventListener('click', selectImage);
    container.addEventListener('pointerdown', selectImage);

    return () => {
      container.removeEventListener('dragstart', startDrag);
      container.removeEventListener('dragend', endDrag);
      resizeHandle.removeEventListener('pointerdown', startResize);
      resizeHandle.removeEventListener('pointermove', doResize);
      resizeHandle.removeEventListener('pointerup', stopResize);
      resizeHandle.removeEventListener('pointercancel', stopResize);
      container.removeEventListener('click', selectImage);
      container.removeEventListener('pointerdown', selectImage);
    };
  }

  private setupAllImages(): void {
    const images = this.editor.querySelectorAll<HTMLImageElement>('img');
    const activeContainers = new Set<HTMLElement>();

    images.forEach((image) => {
      let container = image.closest<HTMLElement>('.editor-image-container');
      if (!container) {
        container = this.wrapImageInContainer(image);
      }

      activeContainers.add(container);

      if (container.dataset.imageSetup === 'true') {
        return;
      }

      const dispose = this.setupImageResize(container, image);
      this.imageContainerDisposers.set(container, dispose);
      container.dataset.imageSetup = 'true';
    });

    this.imageContainerDisposers.forEach((dispose, container) => {
      if (activeContainers.has(container) || this.editor.contains(container)) {
        return;
      }

      dispose();
      this.imageContainerDisposers.delete(container);
    });
  }

  private reSetupImages(): void {
    if (this.imageDebounce) {
      window.clearTimeout(this.imageDebounce);
    }

    this.imageDebounce = window.setTimeout(() => {
      this.setupAllImages();
    }, 50);
  }

  private insertImageToEditor(file: File, fileContent: string): void {
    const selection = window.getSelection();
    let inserted = false;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (this.editor.contains(range.commonAncestorContainer)) {
        const imageContainer = this.doc.createElement('div');
        imageContainer.className = 'editor-image-container';
        imageContainer.setAttribute('contenteditable', 'false');

        const image = this.doc.createElement('img');
        image.src = fileContent;
        image.alt = file.name;

        const resizeHandle = this.doc.createElement('div');
        resizeHandle.className = 'editor-image-container__handle';

        imageContainer.appendChild(image);
        imageContainer.appendChild(resizeHandle);

        try {
          range.deleteContents();
          range.insertNode(imageContainer);
          inserted = true;
          this.selectImageContainer(imageContainer);
        } catch (error) {
          console.warn('[HtmlEditor] Failed to insert image at cursor:', error);
        }
      }
    }

    if (!inserted) {
      const imageContainer = this.doc.createElement('div');
      imageContainer.className = 'editor-image-container';
      imageContainer.setAttribute('contenteditable', 'false');

      const image = this.doc.createElement('img');
      image.src = fileContent;
      image.alt = file.name;

      const resizeHandle = this.doc.createElement('div');
      resizeHandle.className = 'editor-image-container__handle';

      imageContainer.appendChild(image);
      imageContainer.appendChild(resizeHandle);
      this.editor.appendChild(imageContainer);

      this.selectImageContainer(imageContainer);
    }

    this.setupAllImages();
    this.emitContentChange();
    this.updateToolbarState();
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          resolve(result);
          return;
        }

        reject(new Error('Image data URL is not a string.'));
      };

      reader.onerror = () => {
        reject(reader.error ?? new Error('Failed to read file as data URL.'));
      };

      reader.readAsDataURL(file);
    });
  }
}
