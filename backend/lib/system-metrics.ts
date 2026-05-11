import * as os from 'node:os';
import { statfs } from 'node:fs/promises';

type MemoryStats = {
  total: number;
  free: number;
  used: number;
  percent: number;
  source: 'cgroup-v2' | 'cgroup-v1' | 'proc-meminfo' | 'os';
};

type DiskStats = {
  total: number;
  free: number;
  used: number;
  percent: number;
  source: 'statfs';
} | null;

type SystemMetrics = {
  memory: MemoryStats;
  disk: DiskStats;
};

const UNLIMITED_CGROUP_THRESHOLD = 1n << 60n;

async function readIntFromFile(path: string): Promise<bigint | null> {
  try {
    const text = (await Bun.file(path).text()).trim();
    if (text.length === 0 || text === 'max') {
      return null;
    }
    return BigInt(text);
  } catch {
    return null;
  }
}

function toPercent(used: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

function bigintToSafeNumber(value: bigint): number {
  if (value <= 0n) {
    return 0;
  }
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(value);
}

async function getCgroupV2Memory(): Promise<MemoryStats | null> {
  const current = await readIntFromFile('/sys/fs/cgroup/memory.current');
  const max = await readIntFromFile('/sys/fs/cgroup/memory.max');

  if (current === null || max === null || max <= 0n || max >= UNLIMITED_CGROUP_THRESHOLD) {
    return null;
  }

  const used = bigintToSafeNumber(current);
  const total = bigintToSafeNumber(max);
  const free = Math.max(0, total - used);

  return {
    total,
    free,
    used,
    percent: toPercent(used, total),
    source: 'cgroup-v2',
  };
}

async function getCgroupV1Memory(): Promise<MemoryStats | null> {
  const usage = await readIntFromFile('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  const limit = await readIntFromFile('/sys/fs/cgroup/memory/memory.limit_in_bytes');

  if (
    usage === null ||
    limit === null ||
    limit <= 0n ||
    limit >= UNLIMITED_CGROUP_THRESHOLD
  ) {
    return null;
  }

  const used = bigintToSafeNumber(usage);
  const total = bigintToSafeNumber(limit);
  const free = Math.max(0, total - used);

  return {
    total,
    free,
    used,
    percent: toPercent(used, total),
    source: 'cgroup-v1',
  };
}

async function getProcMeminfoMemory(): Promise<MemoryStats | null> {
  try {
    const content = await Bun.file('/proc/meminfo').text();
    const lines = content.split(/\r?\n/);

    let memTotalKb = 0;
    let memAvailableKb = 0;

    for (const line of lines) {
      if (line.startsWith('MemTotal:')) {
        const value = Number.parseInt(line.replace(/\D+/g, ''), 10);
        if (Number.isFinite(value)) {
          memTotalKb = value;
        }
      }
      if (line.startsWith('MemAvailable:')) {
        const value = Number.parseInt(line.replace(/\D+/g, ''), 10);
        if (Number.isFinite(value)) {
          memAvailableKb = value;
        }
      }
    }

    if (memTotalKb <= 0) {
      return null;
    }

    const total = memTotalKb * 1024;
    const free = Math.max(0, memAvailableKb * 1024);
    const used = Math.max(0, total - free);

    return {
      total,
      free,
      used,
      percent: toPercent(used, total),
      source: 'proc-meminfo',
    };
  } catch {
    return null;
  }
}

function getOsMemory(): MemoryStats {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    total,
    free,
    used,
    percent: toPercent(used, total),
    source: 'os',
  };
}

function toBigInt(value: bigint | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

async function getDiskStats(): Promise<DiskStats> {
  try {
    const info = await statfs('/');

    const bsize = toBigInt(info.bsize);
    const blocks = toBigInt(info.blocks);
    const bfree = toBigInt(info.bfree);

    const totalBig = blocks * bsize;
    const freeBig = bfree * bsize;
    const usedBig = totalBig > freeBig ? totalBig - freeBig : 0n;

    const total = bigintToSafeNumber(totalBig);
    const free = bigintToSafeNumber(freeBig);
    const used = bigintToSafeNumber(usedBig);

    return {
      total,
      free,
      used,
      percent: toPercent(used, total),
      source: 'statfs',
    };
  } catch {
    return null;
  }
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const memory =
    (await getCgroupV2Memory()) ??
    (await getCgroupV1Memory()) ??
    (await getProcMeminfoMemory()) ??
    getOsMemory();

  const disk = await getDiskStats();

  return {
    memory,
    disk,
  };
}
