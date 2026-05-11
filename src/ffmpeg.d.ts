declare module '@ffmpeg/ffmpeg/dist/esm/index.js' {
  export type FFmpegLogEvent = { type: string; message: string };
  export type FFmpegProgressEvent = { progress: number; time?: number };

  export type FFmpegLoadOptions = {
    classWorkerURL?: string;
    coreURL?: string;
    wasmURL?: string;
    workerURL?: string;
  };

  export class FFmpeg {
    loaded: boolean;
    on(event: 'log', callback: (event: FFmpegLogEvent) => void): void;
    on(event: 'progress', callback: (event: FFmpegProgressEvent) => void): void;
    off(event: 'log', callback: (event: FFmpegLogEvent) => void): void;
    off(event: 'progress', callback: (event: FFmpegProgressEvent) => void): void;
    load(options?: FFmpegLoadOptions, extras?: { signal?: AbortSignal }): Promise<boolean>;
    exec(args: string[], timeout?: number, extras?: { signal?: AbortSignal }): Promise<number>;
    writeFile(path: string, data: Uint8Array | string): Promise<boolean>;
    readFile(path: string, encoding?: 'binary' | 'utf8'): Promise<Uint8Array | string>;
    deleteFile(path: string): Promise<boolean>;
    terminate(): void;
  }
}
