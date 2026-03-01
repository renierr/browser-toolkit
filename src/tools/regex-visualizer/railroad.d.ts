declare module 'railroad-diagrams' {
  export function Diagram(...items: any[]): {
    toSVG(): SVGSVGElement;
    addTo(container: HTMLElement): void;
  };
  export function Sequence(...items: any[]): any;
  export function Choice(index: number, ...items: any[]): any;
  export function Optional(item: any): any;
  export function OneOrMore(item: any, repeat?: any): any;
  export function ZeroOrMore(item: any, repeat?: any): any;
  export function Terminal(text: string): any;
  export function NonTerminal(text: string): any;
  export function Comment(text: string): any;
  export function Group(item: any, label?: string): any;
}

declare module 'regjsparser' {
  export function parse(regex: string, flags: string): any;
}
