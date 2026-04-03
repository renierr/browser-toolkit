import type { HtmlEditorExtraToolbarButton } from './types.ts';

const DEFAULT_FORE_COLORS = [
  '#000000',
  '#FFFFFF',
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FFFF00',
  '#FF00FF',
  '#00FFFF',
  '#808080',
  '#C0C0C0',
] as const;

const DEFAULT_HILITE_COLORS = [
  'transparent',
  '#FFFF00',
  '#00FF00',
  '#00FFFF',
  '#FF00FF',
  '#FF9900',
  '#FF0000',
  '#0000FF',
  '#800080',
  '#008000',
] as const;

const renderColorSwatches = (colors: readonly string[]): string => {
  return colors
    .map((color) => {
      const border =
        color === '#FFFFFF' || color === 'transparent' ? 'border: 1px solid #ccc;' : '';
      return `<button
        type="button"
        class="html-editor__color-swatch w-6 h-6 rounded"
        style="background-color: ${color}; ${border}"
        data-editor-color="${color}"
      ></button>`;
    })
    .join('');
};

const renderExtraButtons = (buttons: readonly HtmlEditorExtraToolbarButton[]): string => {
  if (!buttons.length) {
    return '';
  }

  return buttons
    .map((button) => {
      const iconHtml = button.icon
        ? `<i data-lucide="${button.icon}" class="w-4 h-4"></i>`
        : `<span class="text-xs">${button.text ?? ''}</span>`;

      return `<button
        type="button"
        class="btn btn-xs ${button.className ?? 'btn-ghost'}"
        title="${button.title}"
        data-editor-extra-action="${button.id}"
      >
        ${iconHtml}
      </button>`;
    })
    .join('');
};

export const renderHtmlEditorTemplate = (
  extraButtons: readonly HtmlEditorExtraToolbarButton[]
): string => {
  return `<div class="html-editor">
    <div class="html-editor__toolbar flex flex-wrap items-center gap-1 p-2 bg-base-200 border-b border-base-300">
      <select
        class="select select-xs select-bordered w-fit"
        aria-label="Heading Level"
        data-editor-heading-select
      >
        <option value="">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="h5">Heading 5</option>
        <option value="h6">Heading 6</option>
      </select>
      <div class="divider divider-horizontal mx-0 h-6"></div>
      <button type="button" class="btn btn-xs btn-ghost" title="Bold" data-editor-action="bold">
        <i data-lucide="bold" class="w-4 h-4"></i>
      </button>
      <button type="button" class="btn btn-xs btn-ghost" title="Italic" data-editor-action="italic">
        <i data-lucide="italic" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Underline"
        data-editor-action="underline"
      >
        <i data-lucide="underline" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Strikethrough"
        data-editor-action="strikeThrough"
      >
        <i data-lucide="strikethrough" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Superscript"
        data-editor-action="superscript"
      >
        <i data-lucide="superscript" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Subscript"
        data-editor-action="subscript"
      >
        <i data-lucide="subscript" class="w-4 h-4"></i>
      </button>

      <div class="dropdown dropdown-bottom">
        <label tabindex="0" class="btn btn-xs btn-ghost relative" title="Text Color">
          <i data-lucide="palette" class="w-4 h-4"></i>
          <span
            class="html-editor__color-indicator"
            style="background-color: #000000"
            data-editor-indicator="foreColor"
          ></span>
        </label>
        <div tabindex="0" class="dropdown-content z-50 p-2 shadow bg-base-100 rounded-box w-48 border">
          <div class="grid grid-cols-5 gap-1 mb-2" data-editor-dropdown="foreColor">
            ${renderColorSwatches(DEFAULT_FORE_COLORS)}
          </div>
          <div class="flex items-center gap-2">
            <input type="color" class="w-8 h-8 p-0 border-0 cursor-pointer" data-editor-color-picker="foreColor" />
          </div>
        </div>
      </div>

      <div class="dropdown dropdown-bottom">
        <label tabindex="0" class="btn btn-xs btn-ghost relative" title="Highlight Color">
          <i data-lucide="highlighter" class="w-4 h-4"></i>
          <span
            class="html-editor__color-indicator"
            style="background-color: transparent; border: 1px solid #ccc"
            data-editor-indicator="hiliteColor"
          ></span>
        </label>
        <div tabindex="0" class="dropdown-content z-50 p-2 shadow bg-base-100 rounded-box w-48 border">
          <div class="grid grid-cols-5 gap-1 mb-2" data-editor-dropdown="hiliteColor">
            ${renderColorSwatches(DEFAULT_HILITE_COLORS)}
          </div>
          <div class="flex items-center gap-2">
            <input type="color" class="w-8 h-8 p-0 border-0 cursor-pointer" data-editor-color-picker="hiliteColor" />
          </div>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Clear Formatting"
        data-editor-action="clear-format"
      >
        <i data-lucide="eraser" class="w-4 h-4"></i>
      </button>

      <div class="divider divider-horizontal mx-0 h-6"></div>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Bullet List"
        data-editor-action="insertUnorderedList"
      >
        <i data-lucide="list" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Numbered List"
        data-editor-action="insertOrderedList"
      >
        <i data-lucide="list-ordered" class="w-4 h-4"></i>
      </button>

      <div class="divider divider-horizontal mx-0 h-6"></div>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Align Left"
        data-editor-action="justifyLeft"
      >
        <i data-lucide="align-left" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Align Center"
        data-editor-action="justifyCenter"
      >
        <i data-lucide="align-center" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Align Right"
        data-editor-action="justifyRight"
      >
        <i data-lucide="align-right" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Justify"
        data-editor-action="justifyFull"
      >
        <i data-lucide="align-justify" class="w-4 h-4"></i>
      </button>

      <div class="divider divider-horizontal mx-0 h-6"></div>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Blockquote"
        data-editor-action="blockquote"
      >
        <i data-lucide="quote" class="w-4 h-4"></i>
      </button>
      <button type="button" class="btn btn-xs btn-ghost" title="Code Block" data-editor-action="pre">
        <i data-lucide="code" class="w-4 h-4"></i>
      </button>

      <div class="divider divider-horizontal mx-0 h-6"></div>
      <button type="button" class="btn btn-xs btn-ghost" title="Insert Link" data-editor-action="link">
        <i data-lucide="link" class="w-4 h-4"></i>
      </button>
      <button type="button" class="btn btn-xs btn-ghost" title="Insert Image" data-editor-action="image">
        <i data-lucide="image" class="w-4 h-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Fullscreen"
        data-editor-action="fullscreen"
      >
        <i data-lucide="maximize" class="w-4 h-4"></i>
      </button>
      ${extraButtons.length ? '<div class="divider divider-horizontal mx-0 h-6"></div>' : ''}
      ${renderExtraButtons(extraButtons)}
    </div>

    <div
      class="html-editor__content bg-base-100 text-base-content min-h-60 px-4 prose max-w-none overflow-y-auto focus:outline-none"
      contenteditable="true"
      data-editor-content
      style="max-height: 50dvh; overflow-y: auto"
    ></div>

    <input type="file" accept="image/*" class="hidden" data-editor-image-input />
  </div>`;
};
