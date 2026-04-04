declare module 'argon2-browser' {
  export function hash(options: Argon2BrowserHashOptions): Promise<Argon2BrowserHashResult>;
  export function verify(options: Argon2VerifyOptions): Promise<undefined>;
  export function unloadRuntime(): void;

  export interface Argon2BrowserHashOptions {
    pass: string | Uint8Array;
    salt: string | Uint8Array;
    time?: number;
    mem?: number;
    hashLen?: number;
    parallelism?: number;
    type?: ArgonType;
    distPath?: string;
    secret?: Uint8Array;
    ad?: Uint8Array;
  }

  export interface Argon2BrowserHashResult {
    encoded: string;
    hash: Uint8Array;
    hashHex: string;
  }

  export interface Argon2VerifyOptions {
    pass: string | Uint8Array;
    encoded: string;
    distPath?: string;
  }

  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2,
  }
}
