import { useState } from 'react';
import { CATEGORY_LABELS, CURATED_STUDIES, studyMatchesQuery, type CuratedStudy } from './catalog';
import { importStudy } from './lichessStudy';
import { notifyStudiesChanged } from './useStudies';

interface StudyCatalogProps {
  /** Set of study ids already imported — those rows render an "Open" badge instead of Import. */
  importedIds: Set<string>;
  /** Fires once import succeeds (or when user clicks an already-imported entry). */
  onOpen: (studyId: string) => void;
  /** Free-text filter. Empty string = show all. */
  searchQuery?: string;
}

/**
 * Read-only catalog of curated public Lichess studies, grouped by category.
 * Clicking a row imports the study (or jumps straight to its viewer if it's
 * already imported).
 */
export function StudyCatalog({ importedIds, onOpen, searchQuery = '' }: StudyCatalogProps) {
  if (CURATED_STUDIES.length === 0) return null;
  const filtered = CURATED_STUDIES.filter((s) => studyMatchesQuery(s, searchQuery));
  if (filtered.length === 0) return null;
  const grouped = groupByCategory(filtered).filter(([, entries]) => entries.length > 0);
  return (
    <div className="flex flex-col gap-4">
      {grouped.map(([cat, entries]) => (
        <section key={cat} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
            {CATEGORY_LABELS[cat]}
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {entries.map((entry) => (
              <CatalogCard
                key={entry.key}
                entry={entry}
                imported={importedIds.has(entry.studyId)}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByCategory(
  entries: CuratedStudy[],
): [CuratedStudy['category'], CuratedStudy[]][] {
  const order: CuratedStudy['category'][] = [
    'fundamentals',
    'openings-white',
    'openings-black',
    'endgames',
  ];
  return order.map((c) => [c, entries.filter((e) => e.category === c)]);
}

interface CardProps {
  entry: CuratedStudy;
  imported: boolean;
  onOpen: (studyId: string) => void;
}

function CatalogCard({ entry, imported, onOpen }: CardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setError(null);
    if (imported) {
      onOpen(entry.studyId);
      return;
    }
    setBusy(true);
    try {
      await importStudy(entry.studyId, { curatedKey: entry.key });
      notifyStudiesChanged();
      onOpen(entry.studyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="card flex w-full flex-col gap-1 p-3 text-left transition hover:border-accent hover:shadow-md disabled:opacity-60"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{entry.name}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              imported
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
            }`}
          >
            {busy ? 'importing…' : imported ? 'open' : 'import'}
          </span>
        </div>
        <p className="text-xs text-ink-600 dark:text-ink-300">{entry.blurb}</p>
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          {entry.side === 'both' ? 'Both sides' : `For ${entry.side}`}
          {entry.author && <> · by {entry.author}</>}
          {' · '}
          <a
            href={`https://lichess.org/study/${entry.studyId}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            view on Lichess
          </a>
        </p>
        {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      </button>
    </li>
  );
}
