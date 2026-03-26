export interface ArchiveEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children?: ArchiveEntry[];
}

export interface ArchiveLoader {
  entries: ArchiveEntry[];
  format: string;
  filename: string;
  totalSize: number;
  loadEntry(path: string): Promise<Uint8Array | null>;
  loadEntryData(): Promise<ArchiveEntry[]>;
  close(): void;
}

const FORMAT_EXTENSIONS: Record<string, string[]> = {
  zip: ['.zip'],
  tar: ['.tar'],
  gz: ['.gz', '.tgz', '.tar.gz', '.tar.gzip'],
  xz: ['.xz', '.tar.xz'],
  '7z': ['.7z'],
  tarxz: ['.tar.xz'],
};

export function detectFormat(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [format, extensions] of Object.entries(FORMAT_EXTENSIONS)) {
    if (extensions.some((ext) => lower.endsWith(ext))) {
      return format;
    }
  }
  return null;
}

export function buildFileTree(entries: ArchiveEntry[]): ArchiveEntry[] {
  const root: ArchiveEntry[] = [];
  const pathMap = new Map<string, ArchiveEntry>();

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const parts = entry.path.split('/').filter(Boolean);
    if (parts.length === 1) {
      root.push(entry);
      pathMap.set(entry.path, entry);
    } else {
      let parentPath = parts.slice(0, -1).join('/');
      if (!pathMap.has(parentPath)) {
        const parentDir: ArchiveEntry = {
          name: parts[parts.length - 2],
          path: parentPath,
          isDirectory: true,
          size: 0,
          children: [],
        };
        pathMap.set(parentPath, parentDir);

        let parent = root.find((e) => e.path === parentPath);
        if (!parent) {
          let currentLevel = root;
          for (let i = 0; i < parts.length - 1; i++) {
            const currentPath = parts.slice(0, i + 1).join('/');
            let dir = currentLevel.find((e) => e.path === currentPath);
            if (!dir) {
              dir = {
                name: parts[i],
                path: currentPath,
                isDirectory: true,
                size: 0,
                children: [],
              };
              currentLevel.push(dir);
              pathMap.set(currentPath, dir);
            }
            currentLevel = (dir as ArchiveEntry).children || [];
          }
        }
      }

      const parentDir = pathMap.get(parentPath);
      if (parentDir && parentDir.children) {
        parentDir.children.push(entry);
        parentDir.size += entry.size;
      }
    }
  }

  const sortEntries = (items: ArchiveEntry[]): ArchiveEntry[] => {
    return items
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => ({
        ...e,
        children: e.children ? sortEntries(e.children) : undefined,
      }));
  };

  return sortEntries(root);
}

function createZipLoader(file: File): ArchiveLoader {
  let zipInfo: Awaited<ReturnType<(typeof import('unzipit'))['unzip']>> | null = null;
  let cachedTotalSize: number | null = null;

  const loadEntries = async () => {
    const { unzip } = await import('unzipit');
    zipInfo = await unzip(file);

    const entries: ArchiveEntry[] = [];
    for (const [path, entry] of Object.entries(zipInfo.entries)) {
      if (path === '') continue;
      entries.push({
        name: path.split('/').pop() || path,
        path: path,
        isDirectory: entry.isDirectory,
        size: entry.size,
      });
    }
    cachedTotalSize = entries.reduce((sum, e) => sum + e.size, 0);
    return entries;
  };

  let entriesPromise: Promise<ArchiveEntry[]> | null = null;

  return {
    get entries(): ArchiveEntry[] {
      throw new Error('Entries not loaded yet. Call loadEntryData first.');
    },
    async loadEntryData(): Promise<ArchiveEntry[]> {
      if (!entriesPromise) {
        entriesPromise = loadEntries();
      }
      return entriesPromise;
    },
    get filename(): string {
      return file.name;
    },
    get format(): string {
      return 'ZIP';
    },
    get totalSize(): number {
      if (cachedTotalSize === null) {
        throw new Error('Total size not available until entries are loaded');
      }
      return cachedTotalSize;
    },
    async loadEntry(path: string): Promise<Uint8Array | null> {
      if (!zipInfo) {
        const { unzip } = await import('unzipit');
        zipInfo = await unzip(file);
      }
      const entry = zipInfo.entries[path];
      if (entry && !entry.isDirectory) {
        const data = await entry.arrayBuffer();
        return new Uint8Array(data);
      }
      return null;
    },
    close(): void {
      zipInfo = null;
      entriesPromise = null;
      cachedTotalSize = null;
    },
  };
}

function createTarLoader(file: File, compression: 'none' | 'gzip' | 'xz'): ArchiveLoader {
  let cachedTotalSize: number | null = null;

  const loadEntries = async () => {
    if (compression === 'xz') {
      const SevenZip = (await import('7z-wasm')).default;
      const sz = await SevenZip();
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      sz.FS.mkdir('/input');
      sz.FS.mkdir('/output');
      const stream = sz.FS.open('/input/archive.tar.xz', 'w+');
      sz.FS.write(stream, uint8Array, 0, uint8Array.length);
      sz.FS.close(stream);

      try {
        sz.callMain(['x', '-y', '/input/archive.tar.xz', '-o/output']);
      } catch {
        throw new Error('Failed to decompress xz');
      }

      const readTarFromDir = (dirPath: string): Uint8Array | null => {
        const files = sz.FS.readdir(dirPath);
        for (const f of files) {
          if (f === '.' || f === '..') continue;
          const fullPath = dirPath + '/' + f;
          const stat = sz.FS.stat(fullPath);
          if (sz.FS.isDir(stat.mode)) {
            const result = readTarFromDir(fullPath);
            if (result) return result;
          } else {
            if (f.endsWith('.tar')) {
              return sz.FS.readFile(fullPath);
            }
          }
        }
        return null;
      };

      const tarFileData = readTarFromDir('/output');
      if (!tarFileData) {
        throw new Error('Failed to extract tar from xz');
      }

      const entries = await parseTarEntries(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(tarFileData);
            controller.close();
          },
        })
      );

      return entries;
    }

    let stream: ReadableStream<Uint8Array>;
    if (compression === 'gzip') {
      stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    } else {
      stream = file.stream();
    }

    return parseTarEntries(stream);
  };

  let entriesPromise: Promise<ArchiveEntry[]> | null = null;

  async function parseTarEntries(stream: ReadableStream<Uint8Array>): Promise<ArchiveEntry[]> {
    const { createTarDecoder } = await import('modern-tar');

    const decoder = createTarDecoder();
    const readable = stream.pipeThrough(decoder);

    const entries: ArchiveEntry[] = [];

    const iterator = (readable as any)[Symbol.asyncIterator]();
    let result = await iterator.next();
    while (!result.done) {
      const entry = result.value;
      const entryPath = entry.header.name.replace(/\/$/, '');
      const isDir = entry.header.type === 'directory' || entry.header.name.endsWith('/');

      entries.push({
        name: entryPath.split('/').pop() || entryPath,
        path: entryPath,
        isDirectory: isDir,
        size: entry.header.size || 0,
      });

      await entry.body.cancel();
      result = await iterator.next();
    }

    cachedTotalSize = entries.reduce((sum, e) => sum + e.size, 0);
    return entries;
  }

  return {
    get entries(): ArchiveEntry[] {
      throw new Error('Entries not loaded yet');
    },
    async loadEntryData(): Promise<ArchiveEntry[]> {
      if (!entriesPromise) {
        entriesPromise = loadEntries();
      }
      return entriesPromise;
    },
    get filename(): string {
      return file.name;
    },
    get format(): string {
      return compression === 'gzip' ? 'TAR.GZ' : compression === 'xz' ? 'TAR.XZ' : 'TAR';
    },
    get totalSize(): number {
      return cachedTotalSize ?? 0;
    },
    async loadEntry(path: string): Promise<Uint8Array | null> {
      const entries = await this.loadEntryData();
      const targetEntry = findEntryByPath(entries, path);
      if (!targetEntry || targetEntry.isDirectory) {
        return null;
      }

      if (compression === 'xz') {
        const SevenZip = (await import('7z-wasm')).default;
        const sz = await SevenZip();
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        sz.FS.mkdir('/input');
        sz.FS.mkdir('/output');
        const s = sz.FS.open('/input/archive.tar.xz', 'w+');
        sz.FS.write(s, uint8Array, 0, uint8Array.length);
        sz.FS.close(s);

        try {
          sz.callMain(['x', '-y', '-i!*.txt', '/input/archive.tar.xz', '-o/output']);
        } catch {}

        return null;
      }

      let stream: ReadableStream<Uint8Array>;
      if (compression === 'gzip') {
        stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
      } else {
        stream = file.stream();
      }

      const { createTarDecoder } = await import('modern-tar');
      const decoder = createTarDecoder();
      const readable = stream.pipeThrough(decoder);

      const iterator = (readable as any)[Symbol.asyncIterator]();
      let result = await iterator.next();
      while (!result.done) {
        const entry = result.value;
        const entryPath = entry.header.name.replace(/\/$/, '');

        if (entryPath === path) {
          const chunks: Uint8Array[] = [];
          const reader = entry.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }

          const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
          const resultArray = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            resultArray.set(chunk, offset);
            offset += chunk.length;
          }
          return resultArray;
        }

        await entry.body.cancel();
        result = await iterator.next();
      }

      return null;
    },
    close(): void {
      entriesPromise = null;
      cachedTotalSize = null;
    },
  };
}

function findEntryByPath(entries: ArchiveEntry[], path: string): ArchiveEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    if (entry.children) {
      const found = findEntryByPath(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}

function create7zLoader(file: File): ArchiveLoader {
  let sevenZipInstance: Awaited<ReturnType<(typeof import('7z-wasm'))['default']>> | null = null;
  let entries: ArchiveEntry[] = [];

  const loadEntries = async () => {
    const SevenZip = (await import('7z-wasm')).default;
    sevenZipInstance = await SevenZip();

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    sevenZipInstance.FS.mkdir('/input');
    sevenZipInstance.FS.mkdir('/output');
    const stream = sevenZipInstance.FS.open('/input/archive.7z', 'w+');
    sevenZipInstance.FS.write(stream, uint8Array, 0, uint8Array.length);
    sevenZipInstance.FS.close(stream);

    try {
      sevenZipInstance.callMain(['x', '-y', '/input/archive.7z', '-o/output']);
    } catch {
      throw new Error('7z extraction failed');
    }

    const collectedEntries: ArchiveEntry[] = [];
    const readDir = (dirPath: string) => {
      const files = sevenZipInstance!.FS.readdir(dirPath);
      for (const f of files) {
        if (f === '.' || f === '..') continue;
        const fullPath = dirPath === '/' ? '/' + f : dirPath + '/' + f;
        const stat = sevenZipInstance!.FS.stat(fullPath);
        if (sevenZipInstance!.FS.isDir(stat.mode)) {
          readDir(fullPath);
        } else {
          const data = sevenZipInstance!.FS.readFile(fullPath);
          const name = f;
          const path = fullPath.replace(/^\//, '').replace(/\/$/, '');
          collectedEntries.push({
            name,
            path,
            isDirectory: false,
            size: data.length,
          });
        }
      }
    };
    readDir('/output');

    entries = collectedEntries;
    return entries;
  };

  let entriesPromise: Promise<ArchiveEntry[]> | null = null;

  return {
    get entries(): ArchiveEntry[] {
      return entries;
    },
    async loadEntryData(): Promise<ArchiveEntry[]> {
      if (!entriesPromise) {
        entriesPromise = loadEntries();
      }
      return entriesPromise;
    },
    get filename(): string {
      return file.name;
    },
    get format(): string {
      return '7Z';
    },
    get totalSize(): number {
      return entries.reduce((sum, e) => sum + e.size, 0);
    },
    async loadEntry(path: string): Promise<Uint8Array | null> {
      if (!sevenZipInstance) {
        await this.loadEntryData();
      }

      const found = findEntryByPath(entries, path);
      if (!found || found.isDirectory) {
        return null;
      }

      const fsPath = '/' + path;
      try {
        const data = sevenZipInstance!.FS.readFile(fsPath);
        return data;
      } catch {
        return null;
      }
    },
    close(): void {
      sevenZipInstance = null;
      entries = [];
      entriesPromise = null;
    },
  };
}

export async function loadArchive(file: File): Promise<ArchiveLoader> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error('Unsupported archive format');
  }

  if (format === 'zip') {
    return createZipLoader(file);
  } else if (format === 'tar') {
    return createTarLoader(file, 'none');
  } else if (format === 'gz') {
    return createTarLoader(file, 'gzip');
  } else if (format === 'xz') {
    return createTarLoader(file, 'xz');
  } else if (format === '7z') {
    return create7zLoader(file);
  }

  throw new Error('Unsupported format');
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
