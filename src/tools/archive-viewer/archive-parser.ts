import type { FileDescription } from 'tarparser';

export interface ArchiveEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  rawData?: Uint8Array;
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
  '7z': ['.7z'],
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

export async function parseZip(file: File): Promise<ParsedArchive> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const entries: ArchiveEntry[] = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (path === '') continue;
    entries.push({
      name: path.split('/').pop() || path,
      path: path.replace(/\/$/, ''),
      isDirectory: zipEntry.dir,
      size: 0,
    });
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.isDirectory) {
      const zipEntry = zip.file(entry.path);
      if (zipEntry) {
        const data = await zipEntry.async('uint8array');
        entry.rawData = data;
        entry.size = data.length;
      }
    }
  }

  return {
    filename: file.name,
    format: 'ZIP',
    totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    entries: buildFileTree(entries),
  };
}

export async function parseTar(file: File, isGzipped: boolean): Promise<ParsedArchive> {
  let tarData: ArrayBuffer;

  if (isGzipped) {
    const response = new Response(file.stream().pipeThrough(new DecompressionStream('gzip')));
    tarData = await response.arrayBuffer();
  } else {
    tarData = await file.arrayBuffer();
  }

  const { parseTar: tarparser } = await import('tarparser');
  const tarFiles = await tarparser(tarData);

  const entries: ArchiveEntry[] = tarFiles.map((f: FileDescription) => ({
    name: f.name.split('/').pop() || f.name,
    path: f.name.replace(/\/$/, ''),
    isDirectory: f.type === 'directory' || f.name.endsWith('/'),
    size: f.size || 0,
    rawData: f.data,
  }));

  return {
    filename: file.name,
    format: isGzipped ? 'TAR.GZ' : 'TAR',
    totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    entries: buildFileTree(entries),
  };
}

export async function parse7z(file: File): Promise<ParsedArchive> {
  const SevenZip = (await import('7z-wasm')).default;
  const sevenZip = await SevenZip();

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  sevenZip.FS.mkdir('/input');
  sevenZip.FS.mkdir('/output');
  const stream = sevenZip.FS.open('/input/archive.7z', 'w+');
  sevenZip.FS.write(stream, uint8Array, 0, uint8Array.length);
  sevenZip.FS.close(stream);

  try {
    sevenZip.callMain(['x', '-y', '/input/archive.7z', '-o/output']);
  } catch {
    throw new Error('7z extraction failed');
  }

  const entries: ArchiveEntry[] = [];
  const readDir = (dirPath: string) => {
    const files = sevenZip.FS.readdir(dirPath);
    for (const f of files) {
      if (f === '.' || f === '..') continue;
      const fullPath = dirPath === '/' ? '/' + f : dirPath + '/' + f;
      const stat = sevenZip.FS.stat(fullPath);
      if (sevenZip.FS.isDir(stat.mode)) {
        readDir(fullPath);
      } else {
        const data = sevenZip.FS.readFile(fullPath);
        const name = f;
        const path = fullPath.replace(/^\//, '').replace(/\/$/, '');
        entries.push({
          name,
          path,
          isDirectory: false,
          size: data.length,
          rawData: data,
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

export async function loadArchive(file: File): Promise<ParsedArchive> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error('Unsupported archive format');
  }

  if (format === 'zip') {
    return parseZip(file);
  } else if (format === 'tar') {
    return parseTar(file, false);
  } else if (format === 'gz') {
    return parseTar(file, true);
  } else if (format === '7z') {
    return parse7z(file);
  }

  throw new Error('Unsupported format');
}
