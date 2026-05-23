import type { StudyRow } from '../db/db';
import { studyAgeDays } from '../db/studies';

interface StudyLibraryProps {
  studies: StudyRow[];
  onOpen: (studyId: string) => void;
  onRemove: (studyId: string) => void;
  /** Free-text filter applied across study name + chapter titles. Empty = show all. */
  searchQuery?: string;
}

/**
 * Compact list of already-imported studies. Newest-first. Each row opens the
 * viewer; secondary "Remove" button deletes from Dexie (PGN is fetchable
 * again, so this is non-destructive in spirit).
 */
export function StudyLibrary({ studies, onOpen, onRemove, searchQuery = '' }: StudyLibraryProps) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? studies.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.chapters.some((c) => c.title.toLowerCase().includes(q)),
      )
    : studies;
  if (filtered.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
        Your library
      </h3>
      <ul className="flex flex-col gap-1">
        {filtered.map((s) => (
          <li
            key={s.id}
            className="card flex items-center justify-between gap-2 px-3 py-2"
          >
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className="flex min-w-0 flex-1 flex-col text-left"
            >
              <span className="truncate text-sm font-medium">{s.name}</span>
              <span className="text-[11px] text-ink-500 dark:text-ink-400">
                {s.chapters.length} {s.chapters.length === 1 ? 'chapter' : 'chapters'}
                {' · '}
                imported {formatAge(studyAgeDays(s))}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(s.id)}
              className="text-[11px] text-ink-500 hover:text-red-600 dark:text-ink-400 dark:hover:text-red-400"
              title="Remove from library (PGN can be re-imported)"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatAge(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}
