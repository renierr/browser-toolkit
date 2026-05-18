import wasmUrl from 'pandoc-wasm/src/pandoc.wasm?url';
import { ConsoleStdout, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim';

type PandocConvertResult = {
  output: Uint8Array;
  stdout: string;
  stderr: string;
  media: Map<string, Uint8Array>;
  mediaZip?: Uint8Array;
};

type PandocInstance = {
  convert: (
    options: any,
    input: string | Uint8Array | Blob,
    inputName: string
  ) => Promise<PandocConvertResult>;
};

let pandocInstance: PandocInstance | null = null;

function createPandocInstance(wasmBinary: ArrayBuffer): Promise<PandocInstance> {
  const args = ['pandoc.wasm', '+RTS', '-H64m', '-RTS'];
  const env: string[] = [];
  const fileSystem = new Map<string, File>();
  const fds = [
    new OpenFile(new File(new Uint8Array(), { readonly: true })),
    ConsoleStdout.lineBuffered((msg) => console.log(`[WASI stdout] ${msg}`)),
    ConsoleStdout.lineBuffered((msg) => console.warn(`[WASI stderr] ${msg}`)),
    new PreopenDirectory('/', fileSystem),
  ];
  const wasi = new WASI(args, env, fds, { debug: false });

  return WebAssembly.instantiate(wasmBinary, {
    wasi_snapshot_preview1: wasi.wasiImport,
  }).then(({ instance }) => {
    const exp = instance.exports as any;
    wasi.initialize({ exports: exp });
    exp.__wasm_call_ctors();

    const dv = new DataView(exp.memory.buffer);

    const argcPtr = exp.malloc(4);
    dv.setUint32(argcPtr, args.length, true);

    const argv = exp.malloc(4 * (args.length + 1));
    for (let i = 0; i < args.length; i++) {
      const arg = exp.malloc(args[i].length + 1);
      new TextEncoder().encodeInto(args[i], new Uint8Array(exp.memory.buffer, arg, args[i].length));
      dv.setUint8(arg + args[i].length, 0);
      dv.setUint32(argv + 4 * i, arg, true);
    }
    dv.setUint32(argv + 4 * args.length, 0, true);

    const argvPtr = exp.malloc(4);
    dv.setUint32(argvPtr, argv, true);

    exp.hs_init_with_rtsopts(argcPtr, argvPtr);

    async function convert(options: any, input: string | Uint8Array | Blob, inputName: string) {
      const optsStr = JSON.stringify(options);
      const encoded = new TextEncoder().encode(optsStr);
      const optsPtr = exp.malloc(encoded.length);
      new TextEncoder().encodeInto(
        optsStr,
        new Uint8Array(exp.memory.buffer, optsPtr, encoded.length)
      );

      fileSystem.clear();
      fileSystem.set('stdin', new File(new Uint8Array(), { readonly: false }));
      fileSystem.set('stdout', new File(new Uint8Array(), { readonly: false }));
      fileSystem.set('stderr', new File(new Uint8Array(), { readonly: false }));
      fileSystem.set('warnings', new File(new Uint8Array(), { readonly: false }));

      let inputData: Uint8Array;
      if (typeof input === 'string') {
        inputData = new TextEncoder().encode(input);
      } else if (input instanceof Blob) {
        inputData = new Uint8Array(await input.arrayBuffer());
      } else {
        inputData = input;
      }

      const stdinFile = fileSystem.get('stdin')!;
      stdinFile.data = inputData;
      stdinFile.readonly = false;

      if (inputName) {
        fileSystem.set(inputName, new File(inputData, { readonly: false }));
      }

      const extractMediaPath = options['extract-media'] as string | undefined;
      if (extractMediaPath) {
        fileSystem.set(extractMediaPath, new File(new Uint8Array(), { readonly: false }));
      }

      const preFiles = new Set(fileSystem.keys());
      exp.convert(optsPtr, encoded.length);

      const mediaFiles = new Map<string, Uint8Array>();
      for (const [name, file] of fileSystem.entries()) {
        if (!preFiles.has(name) && file.data.length > 0) {
          mediaFiles.set(name, new Uint8Array(file.data));
        }
      }

      const stdoutFile = fileSystem.get('stdout')!;
      const stderrFile = fileSystem.get('stderr')!;

      let mediaZip: Uint8Array | undefined;
      if (extractMediaPath) {
        const f = fileSystem.get(extractMediaPath);
        if (f && f.data.length > 0) {
          mediaZip = new Uint8Array(f.data);
        }
      }

      let output = new Uint8Array(0);
      if (stdoutFile.data.length > 0) {
        output = new Uint8Array(stdoutFile.data);
      }

      return {
        output,
        stdout: new TextDecoder('utf-8').decode(stdoutFile.data),
        stderr: new TextDecoder('utf-8').decode(stderrFile.data),
        media: mediaFiles,
        mediaZip,
      };
    }

    return { convert };
  });
}

export async function getPandocInstance() {
  if (pandocInstance) return pandocInstance;

  const res = await fetch(wasmUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch pandoc.wasm: ${res.statusText}`);
  }
  const wasmBinary = await res.arrayBuffer();

  pandocInstance = await createPandocInstance(wasmBinary);
  return pandocInstance;
}

export async function convertInput(
  options: any,
  input: Uint8Array,
  inputName: string
): Promise<PandocConvertResult> {
  const instance = await getPandocInstance();
  return instance.convert(options, input, inputName);
}
