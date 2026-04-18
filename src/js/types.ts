export type ToolScript = (payload?: any) => void | (() => void);
export type ToolModule = { default?: ToolScript; init?: ToolScript };

/**
 * Configuration for tools that can act as share targets.
 * When files are shared to the PWA with matching MIME types,
 * the app will route to this tool and pass the files as payload.
 */
export interface ShareTargetConfig {
  /**
   * Array of MIME types this tool accepts (e.g., ["image/*", "image/png"]).
   * Supports wildcards like "image/*" for all image types.
   */
  accept: string[];
}

export interface Tool {
  name: string;
  description: string;
  path: string;
  html: string;

  /**
   * Optional init hook that runs when the tool route is rendered.
   *
   * If you attach global side effects (e.g. `document/window` listeners, intervals, observers),
   * return a cleanup function to remove them. The app will call the cleanup on route change
   * (before the next tool is rendered).
   *
   * Example:
   * ```ts
   * script: () => {
   *   const onKeyDown = () => {};
   *   document.addEventListener('keydown', onKeyDown);
   *   return () => document.removeEventListener('keydown', onKeyDown);
   * }
   * ```
   */
  script?: ToolScript;

  draft: boolean;
  example: boolean; // only for template project to mark the examples
  icon?: string;
  order: number;
  sectionId?: string;

  hideHeader?: boolean;
  hideFooter?: boolean;

  /**
   * Optional share target configuration.
   * If defined, this tool will receive shared files matching the specified MIME types.
   */
  shareTarget?: ShareTargetConfig;

  /**
   * Optional partial templates/resources (e.g. nested HTML, CSS).
   */
  partials?: Record<string, string>;

  /**
   * Optional lazy loading function for the tool template assets.
   * Can return a single HTML string or an object with multiple files.
   */
  loadHtml?: () => Promise<string | { template: string; partials: Record<string, string> }>;

  /**
   * Optional lazy loading function for the tool script.
   */
  loadScript?: () => Promise<ToolModule>;
}

export type CustomMainContext = {
  tools: Tool[];
};

export type CustomMainModule = {
  default?: (ctx: CustomMainContext) => void | Promise<void>;
  init?: (ctx: CustomMainContext) => void | Promise<void>;
};
