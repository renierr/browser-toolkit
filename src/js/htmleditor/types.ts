export type HtmlEditorContentChangeEvent = {
  readonly html: string;
  readonly cleanHtml: string;
  readonly hasContent: boolean;
};

export type HtmlEditorToolbarState = {
  readonly hasSelectionInEditor: boolean;
  readonly blockTag: string | null;
};

export type HtmlEditorExtraToolbarButton = {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly text?: string;
  readonly className?: string;
};

export type HtmlEditorOptions = {
  readonly host: HTMLElement;
  readonly sanitizeHtml?: (html: string) => string;
  readonly initialHtml?: string;
  readonly contentClassName?: string;
  readonly extraToolbarButtons?: readonly HtmlEditorExtraToolbarButton[];
  readonly onToolbarButtonClick?: (
    buttonId: string,
    editor: { readonly isFullscreen: boolean }
  ) => void;
  readonly onContentChange?: (event: HtmlEditorContentChangeEvent) => void;
  readonly onToolbarStateChange?: (state: HtmlEditorToolbarState) => void;
  readonly onFullscreenChange?: (isFullscreen: boolean) => void;
};
