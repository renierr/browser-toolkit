// allow importing wasm with `?url` in TS
declare module '*.wasm?url' {
  const src: string;
  export default src;
}
