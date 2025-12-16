declare global {
  interface SiteContextCustom {
    custom?: {
      foo: string;
      bar?: number
    };
  }
}
export {};
