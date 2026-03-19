declare module 'overtype/parser' {
  export class MarkdownParser {
    static parse(
      text: string,
      activeLine?: number,
      showActiveLineRaw?: boolean,
      instanceHighlighter?: (code: string, language: string) => string,
      isPreviewMode?: boolean
    ): string;
  }
}
