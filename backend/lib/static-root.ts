import { statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type StaticRootResolution = {
  root: string;
  source: string;
  checked: string[];
};

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function toAbsolutePath(path: string, cwd: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  return resolve(cwd, path);
}

export function resolveStaticRoot(): StaticRootResolution {
  const checked: string[] = [];
  const cwd = process.cwd();
  const execDir = dirname(process.execPath);
  let moduleDir = cwd;
  try {
    moduleDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    moduleDir = cwd;
  }

  const envStaticRoot = process.env.STATIC_ROOT?.trim();
  const rawCandidates: Array<{ path: string; source: string }> = [];

  if (envStaticRoot) {
    rawCandidates.push({
      path: toAbsolutePath(envStaticRoot, cwd),
      source: 'env:STATIC_ROOT',
    });
  }

  rawCandidates.push(
    {
      path: resolve(moduleDir, '..', '..', 'dist'),
      source: 'module-dir',
    },
    {
      path: resolve(execDir, '..', 'dist'),
      source: 'exec-dir-parent',
    },
    {
      path: resolve(execDir, 'dist'),
      source: 'exec-dir',
    },
    {
      path: resolve(cwd, '..', 'dist'),
      source: 'cwd-parent',
    },
    {
      path: resolve(cwd, 'dist'),
      source: 'cwd',
    }
  );

  const seen = new Set<string>();
  for (const candidate of rawCandidates) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    checked.push(candidate.path);
    if (isDirectory(candidate.path)) {
      return {
        root: candidate.path,
        source: candidate.source,
        checked,
      };
    }
  }

  return {
    root: resolve(cwd, '..', 'dist'),
    source: 'fallback-cwd-parent',
    checked,
  };
}
