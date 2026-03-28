declare module 'markdown-it-emoji' {
  import MarkdownIt from 'markdown-it';
  export const full: Record<string, string>;
  export const light: Record<string, string>;
  export const bare: Record<string, string>;
  export function emoji(
    md: MarkdownIt,
    options?: { replaceAt?: (str: string, key: string) => string; defs?: Record<string, string> }
  ): void;
}

declare module 'markdown-it-footnote' {
  import MarkdownIt from 'markdown-it';
  export default function footnote(md: MarkdownIt): void;
}

declare module 'markdown-it-task-lists' {
  import MarkdownIt from 'markdown-it';
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  export default function taskLists(md: MarkdownIt, options?: TaskListsOptions): void;
}

declare module 'markdown-it-container' {
  import MarkdownIt from 'markdown-it';
  interface ContainerOptions {
    render: (tokens: { nesting: number; info: string }[], idx: number) => string;
  }
  export default function container(md: MarkdownIt, name: string, options: ContainerOptions): void;
}
