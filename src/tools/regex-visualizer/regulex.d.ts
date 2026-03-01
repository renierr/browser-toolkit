declare module 'regulex' {
  export function parse(regex: string): any;
  export function visualize(tree: any, flags: string, container: HTMLElement): void;
}
