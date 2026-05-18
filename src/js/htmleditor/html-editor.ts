import { renderHtmlEditorTemplate } from './toolbar-template.ts';
import type {
  HtmlEditorContentChangeEvent,
  HtmlEditorOptions,
  HtmlEditorToolbarState,
} from './types.ts';
import { sanitizeHtml } from './sanitizer.ts';

type BlockFormat = {
  readonly tag: string;
  readonly level?: number;
};

export class HtmlEditor {
  private readonly host: HTMLElement;
  private readonly sanitizeHtml?: (html: string) => string;
  private readonly onContentChange?: (event: HtmlEditorContentChangeEvent) => void;
  private readonly onToolbarStateChange?: (state: HtmlEditorToolbarState) => void;
  private readonly onToolbarButtonClick?: (
    buttonId: string,
    editor: { readonly isFullscreen: boolean }
  ) => void;
  private readonly onFullscreenChange?: (isFullscreen: boolean) => void;
  private readonly initialHtml: string;
  private readonly contentClassName: string;

  private readonly root: HTMLElement | null = null;
  private readonly toolbar: HTMLElement | null = null;
  private readonly content: HTMLElement | null = null;
  private readonly imageInput: HTMLInputElement | null = null;

  private readonly disposers: Array<() => void> = [];
  private readonly imageContainerDisposers = new Map<HTMLElement, () => void>();

  private imageDebounce: number | undefined;
  private imageObserver: MutationObserver | null = null;
  private lastBlockTag = '';
  private fullscreen = false;

  constructor(options: HtmlEditorOptions) {
    this.host = options.host;
    this.sanitizeHtml = options.sanitizeHtml ?? sanitizeHtml;
    this.initialHtml = options.initialHtml ?? '<p><br></p>';
    this.contentClassName = options.contentClassName ?? '';
    this.onContentChange = options.onContentChange;
    this.onToolbarStateChange = options.onToolbarStateChange;
    this.onToolbarButtonClick = options.onToolbarButtonClick;
    this.onFullscreenChange = options.onFullscreenChange;

    this.host.innerHTML = renderHtmlEditorTemplate(options.extraToolbarButtons ?? []);

    this.root = this.host.querySelector('.html-editor');
    this.toolbar = this.host.querySelector('.html-editor__toolbar');
    this.content = this.host.querySelector('[data-editor-content]');
    this.imageInput = this.host.querySelector('[data-editor-image-input]');

    if (this.contentClassName && this.content) {
      this.content.classList.add(...this.contentClassName.split(' ').filter(Boolean));
    }
  }

  get isFullscreen(): boolean {
    return this.fullscreen;
  }

  mount(): void {
    if (!this.toolbar || !this.content || !this.imageInput) {
      console.error('[HtmlEditor] Required editor nodes were not created.');
      return;
    }

    this.setupToolbarListeners();
    this.setupEditorListeners();
    this.setHtml(this.initialHtml);
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

    if (this.fullscreen) {
      this.toggleFullscreen(false);
    }
  }

  focus(): void {
    this.content?.focus();
  }

  setHtml(html: string): void {
    if (!this.content) {
      return;
    }

    this.content.innerHTML = this.sanitizeHtml ? this.sanitizeHtml(html) : html;
    this.ensureEditorContent();
    this.setupAllImages();
    this.updateToolbarState();
    this.emitContentChange();
  }

  getHtml(): string {
    return this.content?.innerHTML ?? '';
  }

  getText(): string {
    return this.content?.innerText ?? '';
  }

  getCleanHtml(): string {
    if (!this.content) {
      return '';
    }

    const clone = this.content.cloneNode(true) as HTMLElement;
    const containers = clone.querySelectorAll('.editor-image-container');

    containers.forEach((container) => {
      container.querySelector('.editor-image-container__handle')?.remove();
      container.classList.remove('editor-image-container--selected');
      container.classList.remove('editor-image-container--dragging');
      container.removeAttribute('data-image-setup');
    });

    const fontElements = clone.querySelectorAll('font');
    fontElements.forEach((font) => {
      const span = document.createElement('span');

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

  promptForLink(): void {
    if (!this.content) {
      return;
    }

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
    if (!this.toolbar) {
      return;
    }

    const headingSelect = this.toolbar.querySelector<HTMLSelectElement>(
      '[data-editor-heading-select]'
    );
    if (headingSelect) {
      this.bindEvent(headingSelect, 'change', (event) => {
        const tag = (event.target as HTMLSelectElement).value;
        if (tag) {
          this.execBlockFormat(tag);
          (event.target as HTMLSelectElement).value = '';
        }
        this.focus();
      });
    }

    this.bindEvent(this.toolbar, 'click', (event) => this.handleToolbarClick(event));
    this.bindEvent(this.toolbar, 'input', (event) => this.handleToolbarInput(event));

    this.bindEvent(document, 'selectionchange', () => {
      if (this.isSelectionInEditor()) {
        this.updateToolbarState();
      }
    });
  }

  private setupEditorListeners(): void {
    const editor = this.content;
    if (!editor) {
      return;
    }

    this.bindEvent(editor, 'input', () => {
      this.ensureEditorContent();
      this.emitContentChange();
      this.reSetupImages();
    });

    this.bindEvent(editor, 'keydown', (event) =>
      this.onEditorKeyDownInternal(event as KeyboardEvent)
    );
    this.bindEvent(editor, 'keyup', () => this.updateToolbarState());
    this.bindEvent(editor, 'pointerup', () => this.updateToolbarState());
    this.bindEvent(editor, 'click', (event) => this.handleEditorClick(event as MouseEvent));
    this.bindEvent(editor, 'pointerdown', (event) => this.handleEditorClick(event as PointerEvent));
    this.bindEvent(editor, 'paste', (event) => this.handlePaste(event as ClipboardEvent));

    this.imageObserver = new MutationObserver(() => {
      this.reSetupImages();
    });

    this.imageObserver.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private handleToolbarClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>('[data-editor-action]');
    if (actionButton) {
      const action = actionButton.dataset.editorAction;
      if (!action) {
        return;
      }

      this.handleToolbarAction(action);
      return;
    }

    const extraButton = target.closest<HTMLButtonElement>('[data-editor-extra-action]');
    if (extraButton) {
      const buttonId = extraButton.dataset.editorExtraAction;
      if (buttonId) {
        this.onToolbarButtonClick?.(buttonId, this);
      }
      return;
    }

    const swatch = target.closest<HTMLElement>('[data-editor-color]');
    if (!swatch) {
      return;
    }

    const commandContainer = swatch.closest<HTMLElement>('[data-editor-dropdown]');
    const command = commandContainer?.dataset.editorDropdown as
      | 'foreColor'
      | 'hiliteColor'
      | undefined;
    const color = swatch.dataset.editorColor;

    if (!command || !color) {
      return;
    }

    this.applyColor(command, color);

    const dropdownContent = swatch.closest<HTMLElement>('.dropdown-content');
    const label = dropdownContent?.previousElementSibling as HTMLElement | null;
    label?.blur();
  }

  private handleToolbarInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const command = input.dataset.editorColorPicker as 'foreColor' | 'hiliteColor' | undefined;
    if (!command) {
      return;
    }

    this.applyColor(command, input.value.toUpperCase());
  }

  private handleToolbarAction(action: string): void {
    switch (action) {
      case 'clear-format':
        this.clearFormatting();
        return;
      case 'blockquote':
      case 'pre':
        this.execBlockFormat(action);
        return;
      case 'link':
        this.promptForLink();
        return;
      case 'image':
        this.promptForImageInsert();
        return;
      case 'fullscreen':
        this.toggleFullscreen();
        return;
      default:
        this.execFormatCommand(action);
    }
  }

  private toggleFullscreen(forceState?: boolean): void {
    if (!this.root) {
      return;
    }

    this.fullscreen = forceState ?? !this.fullscreen;
    this.root.classList.toggle('html-editor--fullscreen', this.fullscreen);
    this.onFullscreenChange?.(this.fullscreen);
    this.focus();
  }

  private onEditorKeyDownInternal(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.fullscreen) {
      this.toggleFullscreen(false);
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

    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      this.lastBlockTag = '';
      return;
    }

    const preElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? (selection.anchorNode as Text).parentElement?.closest('pre')
        : null;
    const blockquoteElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? (selection.anchorNode as Text).parentElement?.closest('blockquote')
        : null;
    const blockElement = preElement || blockquoteElement;

    if (event.key === 'ArrowUp') {
      if (blockElement && blockElement === blockElement.parentElement?.firstChild) {
        const range = selection.getRangeAt(0);
        if (range.startOffset === 0 && range.endOffset === 0) {
          event.preventDefault();
          const paragraph = document.createElement('p');
          paragraph.innerHTML = '<br>';
          blockElement.parentNode?.insertBefore(paragraph, blockElement);

          const newRange = document.createRange();
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
      if (blockElement && blockElement === blockElement.parentElement?.lastChild) {
        event.preventDefault();
        const paragraph = document.createElement('p');
        paragraph.innerHTML = '<br>';

        if (blockElement.nextSibling) {
          blockElement.parentNode?.insertBefore(paragraph, blockElement.nextSibling);
        } else {
          blockElement.parentNode?.appendChild(paragraph);
        }

        const newRange = document.createRange();
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
    const editor = this.content;
    if (!editor) {
      return;
    }

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
          const imageFile = item.getAsFile();
          if (imageFile) {
            imageFiles.push(imageFile);
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
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }

    this.emitContentChange();

    window.setTimeout(() => {
      this.reSetupImages();
    }, 150);
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
    const event: HtmlEditorContentChangeEvent = {
      html: this.getHtml(),
      cleanHtml: this.getCleanHtml(),
      hasContent: Boolean(this.getText().trim()),
    };

    this.onContentChange?.(event);
  }

  private emitToolbarStateChange(state: HtmlEditorToolbarState): void {
    this.onToolbarStateChange?.(state);
  }

  private ensureEditorContent(): void {
    if (!this.content) {
      return;
    }

    if (!this.content.innerHTML.trim()) {
      this.content.innerHTML = '<p><br></p>';
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
    const editor = this.content;

    if (!selection || !selection.anchorNode || !editor) {
      return false;
    }

    let node: Node | null = selection.anchorNode;
    while (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    return Boolean(node && (node === editor || editor.contains(node)));
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
      return { tag: tagName, level: Number.parseInt(tagName[1], 10) };
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
    if (!this.toolbar) {
      return;
    }

    const blockFormat = this.getCurrentBlockFormat();
    const isHeading = Boolean(blockFormat && /^h[1-6]$/.test(blockFormat.tag));

    const commandButtons: Record<string, string> = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      strikeThrough: 'strikeThrough',
      superscript: 'superscript',
      subscript: 'subscript',
      insertUnorderedList: 'insertUnorderedList',
      insertOrderedList: 'insertOrderedList',
      justifyLeft: 'justifyLeft',
      justifyCenter: 'justifyCenter',
      justifyRight: 'justifyRight',
      justifyFull: 'justifyFull',
    };

    Object.entries(commandButtons).forEach(([action, command]) => {
      const button = this.toolbar?.querySelector<HTMLButtonElement>(
        `[data-editor-action="${action}"]`
      );
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

    const headingSelect = this.toolbar.querySelector<HTMLSelectElement>(
      '[data-editor-heading-select]'
    );
    if (headingSelect) {
      headingSelect.value = blockFormat && /^h[1-6]$/.test(blockFormat.tag) ? blockFormat.tag : '';
    }

    const blockquoteButton = this.toolbar.querySelector<HTMLButtonElement>(
      '[data-editor-action="blockquote"]'
    );
    if (blockquoteButton) {
      const isBlockquote = blockFormat?.tag === 'blockquote';
      blockquoteButton.classList.toggle('btn-active', isBlockquote);
      blockquoteButton.classList.toggle('btn-ghost', !isBlockquote);
    }

    const codeButton = this.toolbar.querySelector<HTMLButtonElement>('[data-editor-action="pre"]');
    if (codeButton) {
      const isCode = blockFormat?.tag === 'pre';
      codeButton.classList.toggle('btn-active', isCode);
      codeButton.classList.toggle('btn-ghost', !isCode);
    }

    const linkButton = this.toolbar.querySelector<HTMLButtonElement>('[data-editor-action="link"]');
    if (linkButton) {
      const isInLink = this.isCursorInLink();
      linkButton.classList.toggle('btn-active', isInLink);
      linkButton.classList.toggle('btn-ghost', !isInLink);
    }

    const foreColorValue = this.safeQueryCommandValue('foreColor');
    this.updateColorIndicator('foreColor', this.colorStringToHex(foreColorValue));

    const hiliteColorValue = this.safeQueryCommandValue('hiliteColor');
    this.updateColorIndicator('hiliteColor', this.colorStringToHex(hiliteColorValue));

    this.emitToolbarStateChange({
      hasSelectionInEditor: this.isSelectionInEditor(),
      blockTag: blockFormat?.tag ?? null,
    });
  }

  private safeQueryCommandValue(command: string): string {
    try {
      const value = document.queryCommandValue(command);
      return String(value ?? '');
    } catch {
      return '';
    }
  }

  private applyColor(command: 'foreColor' | 'hiliteColor', color: string): void {
    if (color === 'transparent') {
      document.execCommand('removeFormat', false);
      if (command === 'hiliteColor') {
        document.execCommand('hiliteColor', false, 'transparent');
      }
    } else {
      document.execCommand(command, false, color);
    }

    this.updateToolbarState();
    this.focus();
    this.emitContentChange();
  }

  private updateColorIndicator(command: 'foreColor' | 'hiliteColor', hexColor: string): void {
    const indicator = this.toolbar?.querySelector<HTMLElement>(
      `[data-editor-indicator="${command}"]`
    );
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
      return this.rgbToHex(
        Number.parseInt(rgbMatch[1], 10),
        Number.parseInt(rgbMatch[2], 10),
        Number.parseInt(rgbMatch[3], 10)
      );
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
          range = document.createRange();
          range.setStart(startContainer, startOffset);
          range.setEnd(startContainer, startOffset + 1);
          selection.removeAllRanges();
          selection.addRange(range);
        } else if (startOffset > 0) {
          range = document.createRange();
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

        range = document.createRange();
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
    const editor = this.content;
    if (!editor) {
      return;
    }

    const target = event.target as Node;
    const imageContainers = editor.querySelectorAll<HTMLElement>('.editor-image-container');

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

    const range = document.createRange();
    range.selectNode(container);
    selection.removeAllRanges();
    selection.addRange(range);

    container.classList.add('editor-image-container--selected');
  }

  private wrapImageInContainer(image: HTMLImageElement): HTMLElement {
    const container = document.createElement('div');
    container.className = 'editor-image-container';
    container.setAttribute('contenteditable', 'false');

    const resizeHandle = document.createElement('div');
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

      const width = Math.max(50, startWidth + (event.clientX - startX));
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
    const editor = this.content;
    if (!editor) {
      return;
    }

    const images = editor.querySelectorAll<HTMLImageElement>('img');
    const activeContainers = new Set<HTMLElement>();

    images.forEach((image) => {
      let container = image.closest<HTMLElement>('.editor-image-container');
      if (!container) {
        container = this.wrapImageInContainer(image);
      }

      activeContainers.add(container);

      if (!container.querySelector('.editor-image-container__handle')) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'editor-image-container__handle';
        container.appendChild(resizeHandle);
      }

      if (container.dataset.imageSetup === 'true' && this.imageContainerDisposers.has(container)) {
        return;
      }

      const existingDispose = this.imageContainerDisposers.get(container);
      if (existingDispose) {
        existingDispose();
        this.imageContainerDisposers.delete(container);
      }

      const dispose = this.setupImageResize(container, image);
      this.imageContainerDisposers.set(container, dispose);
      container.dataset.imageSetup = 'true';
    });

    this.imageContainerDisposers.forEach((dispose, container) => {
      if (activeContainers.has(container)) {
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
    const editor = this.content;
    if (!editor) {
      return;
    }

    const selection = window.getSelection();
    let inserted = false;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'editor-image-container';
        imageContainer.setAttribute('contenteditable', 'false');

        const image = document.createElement('img');
        image.src = fileContent;
        image.alt = file.name;

        const resizeHandle = document.createElement('div');
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
      const imageContainer = document.createElement('div');
      imageContainer.className = 'editor-image-container';
      imageContainer.setAttribute('contenteditable', 'false');

      const image = document.createElement('img');
      image.src = fileContent;
      image.alt = file.name;

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'editor-image-container__handle';

      imageContainer.appendChild(image);
      imageContainer.appendChild(resizeHandle);
      editor.appendChild(imageContainer);
      this.selectImageContainer(imageContainer);
    }

    this.setupAllImages();
    this.updateToolbarState();
    this.emitContentChange();
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
