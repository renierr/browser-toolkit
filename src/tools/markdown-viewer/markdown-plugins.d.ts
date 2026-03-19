declare module 'markdown-it-emoji' {
  import type { Token } from 'markdown-it';
  function emoji(md: { use: (plugin: (md: unknown) => void) => unknown }): void;
  export default emoji;
  export const bare: typeof emoji;
  export const light: typeof emoji;
  export const full: typeof emoji;
}

declare module 'markdown-it-footnote' {
  function footnote(md: unknown): void;
  export default footnote;
}

declare module 'markdown-it-task-lists' {
  interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  function taskLists(md: unknown, options?: TaskListOptions): void;
  export default taskLists;
}

declare module 'markdown-it-container' {
  interface ContainerOptions {
    render?: (tokens: unknown[], idx: number) => string;
    validate?: (params: string) => boolean;
    marker?: string;
  }
  function container(md: unknown, name: string, options?: ContainerOptions): void;
  export default container;
}
