export type ToolScript = () => void | (() => void);
export type ToolModule = { default?: ToolScript; init?: ToolScript };

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
}

export type CustomMainContext = {
  tools: Tool[];
};

export type CustomMainModule = {
  default?: (ctx: CustomMainContext) => void | Promise<void>;
  init?: (ctx: CustomMainContext) => void | Promise<void>;
};
