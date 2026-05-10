import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { syncDb } from './sync-db';

const SYNC_DB_PATH = './data/sync.sqlite';
const BACKUP_DIR = './data/backup';
const BACKUP_PREFIX = 'sync-';
const BACKUP_EXT = '.sqlite';
const MAX_BACKUPS = 7;

function formatUtcDateStamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatUtcTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}Z`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function getMsUntilNextUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next - now.getTime());
}

async function rotateBackups(): Promise<void> {
  const entries = await readdir(BACKUP_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(BACKUP_PREFIX) && entry.name.endsWith(BACKUP_EXT))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  const stale = files.slice(MAX_BACKUPS);
  await Promise.all(stale.map((name) => rm(join(BACKUP_DIR, name), { force: true })));
}

async function hasBackupForUtcDay(date: Date): Promise<boolean> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const entries = await readdir(BACKUP_DIR, { withFileTypes: true });
  const dayPrefix = `${BACKUP_PREFIX}${formatUtcDateStamp(date)}-`;
  return entries.some(
    (entry) => entry.isFile() && entry.name.startsWith(dayPrefix) && entry.name.endsWith(BACKUP_EXT)
  );
}

async function createSyncBackup(): Promise<string> {
  await mkdir(dirname(SYNC_DB_PATH), { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });

  const backupName = `${BACKUP_PREFIX}${formatUtcTimestamp(new Date())}${BACKUP_EXT}`;
  const backupPath = join(BACKUP_DIR, backupName);
  const escapedBackupPath = escapeSqlString(backupPath);

  syncDb.exec('PRAGMA wal_checkpoint(FULL);');
  syncDb.exec(`VACUUM INTO '${escapedBackupPath}';`);

  await rotateBackups();
  return backupPath;
}

export function startSyncBackupScheduler(): void {
  let backupInProgress = false;

  const runBackup = async (reason: 'startup' | 'scheduled'): Promise<void> => {
    if (backupInProgress) {
      console.warn(`[sync-backup] skipped ${reason} backup, previous run still active`);
      return;
    }

    backupInProgress = true;
    try {
      if (reason === 'startup' && (await hasBackupForUtcDay(new Date()))) {
        console.log('[sync-backup] skipped startup backup, backup already exists for current UTC day');
        return;
      }

      const backupPath = await createSyncBackup();
      console.log(`[sync-backup] ${reason} backup created ${backupPath}`);
    } catch (error) {
      console.error(`[sync-backup] failed ${reason} backup`, error);
    } finally {
      backupInProgress = false;
    }
  };

  const scheduleNext = (): void => {
    const delayMs = getMsUntilNextUtcMidnight(new Date());
    setTimeout(async () => {
      await runBackup('scheduled');
      scheduleNext();
    }, delayMs);
  };

  void runBackup('startup');
  scheduleNext();
  console.log('[sync-backup] scheduler started (daily at 00:00 UTC)');
}
