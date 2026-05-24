import { useEffect, useMemo, useState } from 'react';
import {
  clearLichessAuth,
  getLichessAuth,
  putLichessAuth,
  recordLichessTest,
  testLichessToken,
} from '../../db/lichessAuth';
import type { LichessAuthRow } from '../../db/db';
import { notifyLichessAuthChanged } from '../../hooks/useLichessAuth';

/**
 * Settings section for the optional Lichess API token. Lichess locked the
 * Opening Explorer behind auth in 2026 — the app falls back to bundled ECO
 * when this isn't set, but with a token the Openings tab gains master-game
 * stats, popular continuations, and other Explorer features.
 *
 * Stored separately from LLM keys ({@link db.lichessAuth} vs {@link db.apiKeys})
 * because it's a different credential category. UI pattern matches the LLM
 * key rows so it feels familiar.
 */
export function LichessSection() {
  const [row, setRow] = useState<LichessAuthRow | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getLichessAuth();
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setRow(await getLichessAuth());
    notifyLichessAuthChanged();
  };

  if (loading) {
    return <div className="text-sm text-muted">Loading Lichess token…</div>;
  }

  return (
    <>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        Optional. The app uses your token to call the Lichess Opening Explorer (master-game
        stats, popular continuations) and to import Studies. Without a token, opening names
        still work from the bundled ECO dataset.{' '}
        <a
          className="underline-offset-2 hover:underline"
          href="https://lichess.org/account/oauth/token/create"
          target="_blank"
          rel="noreferrer"
        >
          Create a personal access token →
        </a>{' '}
        (no scopes required — the Explorer is public-data-only).
      </p>

      {row ? <SavedTokenRow row={row} onChange={refresh} /> : <AddTokenForm onChange={refresh} />}
    </>
  );
}

interface SavedTokenRowProps {
  row: LichessAuthRow;
  onChange: () => Promise<void>;
}

function SavedTokenRow({ row, onChange }: SavedTokenRowProps) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const masked = useMemo(() => maskToken(row.token), [row.token]);

  if (editing) {
    return (
      <AddTokenForm
        initial={row}
        onChange={async () => {
          await onChange();
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-md border border-ink-200 px-3 py-2 dark:border-ink-800">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium">{row.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-600 dark:text-ink-400">
        <span>{revealed ? row.token : masked}</span>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      <div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
        {formatTestStatus(row)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            try {
              const result = await testLichessToken(row.token);
              await recordLichessTest('ok', `OK — ${result.username}`);
            } catch (err) {
              await recordLichessTest('error', err instanceof Error ? err.message : String(err));
            } finally {
              setTesting(false);
              await onChange();
            }
          }}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          type="button"
          className="btn-ghost text-xs text-red-600 dark:text-red-400"
          onClick={async () => {
            if (window.confirm('Remove the Lichess token? Opening Explorer will be disabled (bundled ECO still works).')) {
              await clearLichessAuth();
              await onChange();
            }
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

interface AddTokenFormProps {
  initial?: LichessAuthRow;
  onChange: () => Promise<void> | void;
  onCancel?: () => void;
}

function AddTokenForm({ initial, onChange, onCancel }: AddTokenFormProps) {
  const [open, setOpen] = useState(!!initial);
  const [token, setToken] = useState(initial?.token ?? '');
  const [label, setLabel] = useState(initial?.label ?? 'Lichess');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        + Add Lichess token
      </button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-md border border-ink-200 p-3 dark:border-ink-800"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!token.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
          // Test before saving — bad tokens shouldn't enter storage.
          const result = await testLichessToken(token);
          await putLichessAuth({ token: token.trim(), label: label.trim() || 'Lichess' });
          await recordLichessTest('ok', `OK — ${result.username}`);
          await onChange();
          if (!initial) {
            setToken('');
            setOpen(false);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">Label</label>
        <input
          className="input mt-1 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">
          Personal access token
        </label>
        <input
          className="input mt-1 font-mono text-xs"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="lip_…"
        />
      </div>
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary text-xs" disabled={submitting || !token.trim()}>
          {submitting ? 'Validating…' : initial ? 'Save changes' : 'Save token'}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function maskToken(t: string): string {
  if (t.length <= 8) return '••••••••';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function formatTestStatus(row: LichessAuthRow): string {
  if (!row.lastTestedAt) return 'Not tested yet.';
  const when = relativeTime(row.lastTestedAt);
  if (row.lastTestStatus === 'ok') return `Tested ${when}: ✓ ${row.lastTestMessage ?? 'OK'}`;
  return `Tested ${when}: ✗ ${row.lastTestMessage ?? 'failed'}`;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}
