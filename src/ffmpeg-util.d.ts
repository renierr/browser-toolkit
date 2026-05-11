declare module '@ffmpeg/util/dist/esm/index.js' {
  export function fetchFile(file: File | Blob | string | URL): Promise<Uint8Array>;
}
