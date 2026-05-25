import { useCallback, useEffect, useState } from 'react';
import type { LessonProgressRow } from '../db/db';
import {
  clearLessonProgress,
  deleteLessonProgress,
  listLessonProgress,
  subscribeLessonProgress,
} from '../db/lessonProgress';

interface LessonResumeQueueProps {
  /** Reload a lesson at the saved chapter + ply. Parent sets URL params
   *  so the StudyViewer mounts with the right initial state. */
  onResume: (studyId: string, chapterIndex: number, ply: number) => void;
}

const MAX_VISIBLE = 5;

/**
 * "Resume lessons" surface that mirrors the Practice queue's role:
 * surfaces lessons the user opened, navigated into, then left without
 * finishing. Recording happens in StudyViewer on every ply / chapter
 * change; the row self-prunes at ply 0 and at chapter completion.
 *
 * Returns null when nothing is in the queue so the Study landing page
 * stays uncluttered for fresh installs.
 */
export function LessonResumeQueue({ onResume }: LessonResumeQueueProps) {
  const [rows, setRows] = useState<LessonProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await listLessonProgress());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeLessonProgress(() => {
      void refresh();
    });
  }, [refresh]);

  if (loading || rows.length === 0) return null;

  const visible = rows.slice(0, MAX_VISIBLE);
  const moreCount = rows.length - visible.length;

  return (
    <section className="card flex flex-col gap-2 p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Resume lesson ({rows.length})
        </h3>
        {confirmingClear ? (
          <span className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="btn-ghost px-2 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                await clearLessonProgress();
                setConfirmingClear(false);
              }}
              className="btn-primary px-2 py-1 text-xs"
            >
              Clear all
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="text-[11px] text-muted hover:text-blunder hover:underline"
          >
            Clear all
          </button>
        )}
      </header>
      <ul className="flex flex-col gap-1">
        {visible.map((row) => {
          const pct = row.totalPlies > 0
            ? Math.round((row.currentPly / row.totalPlies) * 100)
            : 0;
          return (
            <li
              key={row.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded px-2 py-1 text-xs odd:bg-surface-2/60"
            >
              <button
                type="button"
                onClick={() => onResume(row.studyId, row.chapterIndex, row.currentPly)}
                className="min-w-0 truncate text-left text-secondary hover:underline"
                title={`${row.studyName} - ${row.chapterTitle}`}
              >
                <span className="font-medium">{row.chapterTitle}</span>
                <span className="text-muted"> - {row.studyName}</span>
              </button>
              <span className="shrink-0 font-mono tabular-nums text-muted">
                {row.currentPly}/{row.totalPlies}
              </span>
              <span
                className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent"
                title={`${pct}% through the chapter`}
              >
                {pct}%
              </span>
              <button
                type="button"
                onClick={() => void deleteLessonProgress(row.id)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-base text-muted hover:bg-blunder/10 hover:text-blunder"
                title="Remove from resume list"
                aria-label={`Remove ${row.chapterTitle} from resume list`}
              >
                x
              </button>
            </li>
          );
        })}
      </ul>
      {moreCount > 0 && (
        <p className="text-[11px] text-faint">
          + {moreCount} older lesson{moreCount === 1 ? '' : 's'} not shown.
        </p>
      )}
    </section>
  );
}
