// allow importing wasm with `?url` in TS
declare module '*.wasm?url' {
  const src: string;
  export default src;
}
declare module '*?worker' {
  class WebWorker extends Worker {
    constructor();
  }
  export default WebWorker;
}

declare module '*?worker&url' {
  const src: string;
  export default src;
}
