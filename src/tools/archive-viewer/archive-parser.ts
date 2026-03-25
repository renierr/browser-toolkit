import type { FileDescription } from 'tarparser';

export interface ArchiveEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children?: ArchiveEntry[];
}

export interface ParsedArchive {
  filename: string;
  format: string;
  totalSize: number;
  entries: ArchiveEntry[];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let zipInstance: any = null;
let tarFilesCache: Map<string, Uint8Array> = new Map();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sevenZipInstance: any = null;

export async function parseZip(file: File): Promise<ParsedArchive> {
  const JSZip = (await import('jszip')).default;
  zipInstance = await JSZip.loadAsync(file);

  const entries: ArchiveEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [path, zipEntry] of Object.entries(zipInstance.files as Record<string, any>)) {
    if (path === '') continue;
    entries.push({
      name: path.split('/').pop() || path,
      path: path.replace(/\/$/, ''),
      isDirectory: zipEntry.dir,
      size: zipEntry._data?.uncompressedSize ?? 0,
    });
  }

  return {
    filename: file.name,
    format: 'ZIP',
    totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    entries: buildFileTree(entries),
  };
}

export async function loadEntryData(path: string): Promise<Uint8Array | null> {
  if (zipInstance) {
    const entry = zipInstance.file(path);
    if (entry) return entry.async('uint8array');
  }

  if (tarFilesCache.has(path)) {
    return tarFilesCache.get(path) ?? null;
  }

  return null;
}

export async function parseTar(
  file: File,
  compression: 'none' | 'gzip' | 'xz'
): Promise<ParsedArchive> {
  let tarData: ArrayBuffer;

  if (compression === 'gzip') {
    const response = new Response(file.stream().pipeThrough(new DecompressionStream('gzip')));
    tarData = await response.arrayBuffer();
  } else if (compression === 'xz') {
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
    tarData = tarFileData.buffer as ArrayBuffer;
  } else {
    tarData = await file.arrayBuffer();
  }

  const { parseTar: tarparser } = await import('tarparser');
  const tarFiles = await tarparser(tarData);

  tarFilesCache.clear();
  const entries: ArchiveEntry[] = tarFiles.map((f: FileDescription) => {
    const entryPath = f.name.replace(/\/$/, '');
    if (!f.name.endsWith('/')) {
      tarFilesCache.set(entryPath, f.data);
    }
    return {
      name: f.name.split('/').pop() || f.name,
      path: entryPath,
      isDirectory: f.type === 'directory' || f.name.endsWith('/'),
      size: f.size || 0,
    };
  });

  const formatLabel = compression === 'gzip' ? 'TAR.GZ' : compression === 'xz' ? 'TAR.XZ' : 'TAR';
  return {
    filename: file.name,
    format: formatLabel,
    totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    entries: buildFileTree(entries),
  };
}

export async function parse7z(file: File): Promise<ParsedArchive> {
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

  const entries: ArchiveEntry[] = [];
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
        entries.push({
          name,
          path,
          isDirectory: false,
          size: data.length,
        });
      }
    }
  };
  readDir('/output');

  return {
    filename: file.name,
    format: '7Z',
    totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    entries: buildFileTree(entries),
  };
}

export function clearCache(): void {
  zipInstance = null;
  tarFilesCache.clear();
  sevenZipInstance = null;
}

export async function loadArchive(file: File): Promise<ParsedArchive> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error('Unsupported archive format');
  }

  if (format === 'zip') {
    return parseZip(file);
  } else if (format === 'tar') {
    return parseTar(file, 'none');
  } else if (format === 'gz') {
    return parseTar(file, 'gzip');
  } else if (format === 'xz') {
    return parseTar(file, 'xz');
  } else if (format === '7z') {
    return parse7z(file);
  }

  throw new Error('Unsupported format');
}
