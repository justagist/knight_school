import { useEffect, useRef, useState } from 'react';
import { clearAllData, formatBytes, getStorageEstimate } from '../../db/storage';
import { exportFilename, exportToBlob, importFromBlob } from '../../db/backup';

export function StorageSection() {
  const [usage, setUsage] = useState<number | null>(null);
  const [quota, setQuota] = useState<number | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [working, setWorking] = useState<null | 'export' | 'import' | 'clear'>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [includeKeysOnExport, setIncludeKeysOnExport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshEstimate = async () => {
    const est = await getStorageEstimate();
    if (est.unsupported) {
      setUnsupported(true);
      return;
    }
    setUsage(est.usage);
    setQuota(est.quota);
  };

  useEffect(() => {
    void refreshEstimate();
  }, []);

  const handleExport = async () => {
    setWorking('export');
    setStatus(null);
    try {
      const blob = await exportToBlob({ includeApiKeys: includeKeysOnExport });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename();
      a.click();
      URL.revokeObjectURL(url);
      setStatus({
        kind: 'ok',
        text: includeKeysOnExport
          ? 'Exported (with API keys — treat the file as a secret).'
          : 'Exported (API keys excluded).',
      });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setWorking(null);
    }
  };

  const handleImportPicked = async (file: File) => {
    const ok = window.confirm(
      `Replace all existing data with the contents of "${file.name}"? This can't be undone.`,
    );
    if (!ok) return;
    setWorking('import');
    setStatus(null);
    try {
      await importFromBlob(file);
      setStatus({ kind: 'ok', text: 'Import complete — reload to see your restored data.' });
      void refreshEstimate();
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setWorking(null);
    }
  };

  const handleClear = async () => {
    const ok = window.confirm(
      'Erase ALL KnightSchool data? This removes every cached engine eval, every saved API key, and any future chat history. Cannot be undone.',
    );
    if (!ok) return;
    const reconfirm = window.prompt('Type ERASE to confirm:');
    if (reconfirm !== 'ERASE') {
      setStatus({ kind: 'error', text: 'Confirmation text didn’t match — nothing was deleted.' });
      return;
    }
    setWorking('clear');
    setStatus(null);
    try {
      await clearAllData();
      setStatus({ kind: 'ok', text: 'All data cleared.' });
      void refreshEstimate();
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <div className="text-sm">
        {unsupported ? (
          <span className="text-muted">Browser doesn't expose a storage estimate.</span>
        ) : usage == null ? (
          <span className="text-muted">Measuring…</span>
        ) : (
          <>
            <span className="font-mono tabular-nums">{formatBytes(usage)}</span>
            {quota != null && quota > 0 && (
              <span className="text-muted"> / {formatBytes(quota)} available</span>
            )}
          </>
        )}
      </div>
      <StorageBreakdown />

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={handleExport}
            disabled={working !== null}
          >
            {working === 'export' ? 'Exporting…' : 'Export data'}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={working !== null}
          >
            {working === 'import' ? 'Importing…' : 'Import data'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportPicked(f);
              e.target.value = '';
            }}
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-ink-600 dark:text-ink-400">
          <input
            type="checkbox"
            checked={includeKeysOnExport}
            onChange={(e) => setIncludeKeysOnExport(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-accent"
          />
          <span>
            <span className="font-medium text-ink-700 dark:text-ink-200">Include API keys.</span>{' '}
            Off by default. Only enable when transferring to a device you own — the export file
            would otherwise leak your credentials if shared.
          </span>
        </label>

        <div className="border-t border-ink-200 pt-3 dark:border-ink-800">
          <button
            type="button"
            className="btn-ghost text-xs text-red-600 dark:text-red-400"
            onClick={handleClear}
            disabled={working !== null}
          >
            {working === 'clear' ? 'Clearing…' : 'Clear all data'}
          </button>
          <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
            Erases every cached engine eval, saved API key, and future chat history. Theme and
            display preferences are kept (they live in localStorage).
          </p>
        </div>

        {status && (
          <div
            className={`rounded-md px-3 py-2 text-xs ${
              status.kind === 'ok'
                ? 'bg-best/10 text-best'
                : 'bg-blunder/10 text-blunder'
            }`}
          >
            {status.text}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * One-line breakdown of what's currently stored. Per spec: tells the user
 * what they'd lose if they tap "Clear all data" without per-category clears.
 */
function StorageBreakdown() {
  const [counts, setCounts] = useState<{
    games: number;
    studies: number;
    threads: number;
    evals: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const { db } = await import('../../db/db');
      const [studies, threads, evals] = await Promise.all([
        db().studies.count(),
        db().chatThreads.count(),
        db().positionEvals.count(),
      ]);
      // No "games" table — analyses are derived from positionEvals + the
      // user's pasted PGNs (held in memory only). Report 0 / "current" for
      // games. Honest rather than synthetic.
      setCounts({ games: 0, studies, threads, evals });
    })();
  }, []);

  if (!counts) return null;

  const parts = [
    `${counts.studies} imported ${counts.studies === 1 ? 'study' : 'studies'}`,
    `${counts.threads} chat ${counts.threads === 1 ? 'thread' : 'threads'}`,
    `${counts.evals.toLocaleString()} cached engine ${counts.evals === 1 ? 'evaluation' : 'evaluations'}`,
  ];
  return (
    <p className="mt-1 text-[11px] text-muted">Includes {parts.join(' · ')}.</p>
  );
}
