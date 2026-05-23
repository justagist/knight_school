import { exportDB, importInto } from 'dexie-export-import';
import { db } from './db';

export interface ExportOptions {
  /**
   * When true, API keys are included in the export blob. Default false so
   * accidentally sharing a backup doesn't leak credentials. The user has to
   * opt in for a personal-device-to-device migration.
   */
  includeApiKeys: boolean;
}

const BACKUP_VERSION = 1;

/**
 * Export every Dexie table KnightSchool owns to a downloadable Blob.
 *
 * Wraps `dexie-export-import.exportDB` and uses its `skipTables` option to
 * exclude api-key data when the user hasn't opted in. The export JSON
 * format is the package's standard schema — interop with their `importDB`
 * is preserved.
 */
export async function exportToBlob(opts: ExportOptions): Promise<Blob> {
  // When excluding api keys we also exclude per-key state. Chat history and
  // commentary travel regardless — they aren't credentials, and a backup
  // without your past Elle conversations would be of limited use.
  const skipTables: string[] = opts.includeApiKeys
    ? []
    : ['apiKeys', 'providerConfig', 'llmGlobal', 'lichessAuth'];

  return exportDB(db(), {
    prettyJson: true,
    skipTables,
  });
}

export function exportFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `knightschool-backup-${stamp}.json`;
}

/** Replace all existing data with the contents of `blob`. */
export async function importFromBlob(blob: Blob): Promise<void> {
  const d = db();
  // overwriteValues=true ensures rows with the same primary key get replaced
  // rather than throwing on conflict. clearTablesBeforeImport=true wipes the
  // target tables first so a partial backup doesn't leave stale rows behind.
  await importInto(d, blob, {
    overwriteValues: true,
    clearTablesBeforeImport: true,
  });
}

/** Used by the future "ABOUT" surface in case we want to display this. */
export function getBackupVersion(): number {
  return BACKUP_VERSION;
}
