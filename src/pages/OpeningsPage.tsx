import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StudyImporter } from '../lessons/StudyImporter';
import { StudyCatalog } from '../lessons/StudyCatalog';
import { StudyLibrary } from '../lessons/StudyLibrary';
import { StudyViewer } from '../lessons/StudyViewer';
import { useStudies } from '../lessons/useStudies';
import { CURATED_STUDIES, findStudyByKey, studyMatchesQuery } from '../lessons/catalog';
import { importStudy, isStudyImported } from '../lessons/lichessStudy';
import { notifyStudiesChanged } from '../lessons/useStudies';
import { DrillView } from '../drill/DrillView';
import { ensureDrillLine, getDrillLine, listDrillLines } from '../db/drillLines';
import { nextDrillLine, priorityLabel, sortByDrillPriority } from '../drill/scheduler';
import type { DrillLineRow } from '../db/db';
import { useLichessAuth } from '../hooks/useLichessAuth';
import { Link } from 'react-router-dom';

const HAS_CURATED = CURATED_STUDIES.length > 0;

/**
 * Openings tab. Two modes:
 *   - Library mode (default): search bar + paste-import + curated catalog + imported list
 *   - Viewer mode: a selected study with chapter navigation
 *
 * Deep links the Analyze view uses:
 *   /openings?search=<text>                   pre-fill the search bar (used by opening-name links)
 *   /openings?study=<lichess-id>              open this specific study
 *   /openings?curated=<catalog-key>           open by catalog key (imports first if needed)
 *   /openings?chapter=<n>                     1-based chapter to open (paired with `study`)
 *
 * The URL is the single source of truth for "what's selected" so back/forward
 * browser nav and shareable links both work.
 */
export function OpeningsPage() {
  const [params, setParams] = useSearchParams();
  const { studies, loading, remove } = useStudies();
  const lichess = useLichessAuth();

  const studyId = params.get('study');
  const curatedKey = params.get('curated');
  const drillId = params.get('drill');
  const searchParam = params.get('search') ?? '';
  const chapterParam = Number(params.get('chapter') ?? '1');
  const chapterIdx = Number.isFinite(chapterParam) && chapterParam > 0 ? chapterParam - 1 : 0;

  // Drill-related state — resolved lazily when the URL has `drill=<id>`.
  const [drillLine, setDrillLine] = useState<DrillLineRow | null>(null);
  const [drillLines, setDrillLines] = useState<DrillLineRow[]>([]);
  const refreshDrillLines = useCallback(async () => {
    setDrillLines(await listDrillLines());
  }, []);
  useEffect(() => {
    void refreshDrillLines();
    const onChange = () => void refreshDrillLines();
    window.addEventListener('ks-drills-changed', onChange);
    return () => window.removeEventListener('ks-drills-changed', onChange);
  }, [refreshDrillLines]);

  // Load the drill line row whenever `drill=<id>` changes.
  useEffect(() => {
    if (!drillId) {
      setDrillLine(null);
      return;
    }
    let cancelled = false;
    void getDrillLine(drillId).then((row) => {
      if (!cancelled) setDrillLine(row ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [drillId]);

  // Local search state — kept in sync with the URL `search` param. The URL is
  // canonical (so the Analyze deep-link works), but typing should feel
  // responsive without rewriting history on every keystroke.
  const [searchText, setSearchText] = useState(searchParam);
  useEffect(() => {
    setSearchText(searchParam);
  }, [searchParam]);

  // Resolve `curated=` to a concrete study id (imports if needed), then
  // rewrite the URL.
  useEffect(() => {
    if (studyId || loading || !curatedKey) return;
    const entry = findStudyByKey(curatedKey);
    if (!entry) return;
    void ensureImported(entry.studyId, entry.key).then((id) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('curated');
        next.set('study', id);
        return next;
      });
    });
  }, [studyId, curatedKey, loading, setParams]);

  const selected = useMemo(
    () => (studyId ? studies.find((s) => s.id === studyId) : undefined),
    [studyId, studies],
  );

  const importedIds = useMemo(() => new Set(studies.map((s) => s.id)), [studies]);

  const openStudy = (id: string) => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('study', id);
      next.delete('curated');
      next.delete('chapter');
      return next;
    });
  };

  const backToLibrary = () => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('study');
      next.delete('chapter');
      return next;
    });
  };

  const setChapter = (i: number) => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('chapter', String(i + 1));
        return next;
      },
      { replace: true },
    );
  };

  /** Start (or resume) a drill for the given chapter + side. */
  const startDrill = useCallback(
    async (study: typeof studies[number], chapterIndex: number, side: 'white' | 'black') => {
      const line = await ensureDrillLine(study, chapterIndex, side);
      await refreshDrillLines();
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('drill', line.id);
        next.delete('study');
        next.delete('chapter');
        next.delete('curated');
        return next;
      });
    },
    [refreshDrillLines, setParams],
  );

  const exitDrill = useCallback(() => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('drill');
      return next;
    });
    void refreshDrillLines();
  }, [refreshDrillLines, setParams]);

  const updateSearch = (value: string) => {
    setSearchText(value);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value.trim()) next.set('search', value);
        else next.delete('search');
        return next;
      },
      { replace: true },
    );
  };

  if (drillId && drillLine) {
    return <DrillView line={drillLine} onExit={exitDrill} onFinished={() => void refreshDrillLines()} />;
  }

  if (selected) {
    return (
      <StudyViewer
        study={selected}
        initialChapter={chapterIdx}
        onChapterChange={setChapter}
        onBack={backToLibrary}
        onStartDrill={(idx, side) => void startDrill(selected, idx, side)}
      />
    );
  }

  // Library mode
  const queryActive = searchText.trim().length > 0;
  const catalogMatches = HAS_CURATED
    ? CURATED_STUDIES.filter((s) => studyMatchesQuery(s, searchText)).length
    : 0;
  const libraryMatches = studies.filter(
    (s) =>
      !queryActive ||
      s.name.toLowerCase().includes(searchText.toLowerCase()) ||
      s.chapters.some((c) => c.title.toLowerCase().includes(searchText.toLowerCase())),
  ).length;
  const nothingMatched = queryActive && catalogMatches === 0 && libraryMatches === 0;

  const lichessSearchUrl = queryActive
    ? `https://lichess.org/study/search?q=${encodeURIComponent(searchText)}`
    : 'https://lichess.org/study/all/popular';
  const lichessSearchLabel = queryActive ? 'Search on Lichess' : 'Browse popular on Lichess';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Study with Elle</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Search the starter catalog or paste a Lichess study URL to import.
        </p>
      </div>

      {/* Search row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="search"
            value={searchText}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search openings — “Caro-Kann”, “London”, “Sicilian”…"
            className="input w-full pr-8"
            aria-label="Search openings"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => updateSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700"
              aria-label="Clear search"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <a
          href={lichessSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-xs"
          title={
            queryActive
              ? `Open lichess.org search for “${searchText}”`
              : 'Browse the most popular studies on Lichess'
          }
        >
          {lichessSearchLabel} ↗
        </a>
      </div>

      {/* No-token cross-link to Settings. Lichess Explorer + private-study
          import unlock once the user pastes a personal token. Surfaced
          here so the user finds it without digging through Settings. */}
      {!lichess.loading && !lichess.hasToken && (
        <div className="card flex items-center gap-3 border-l-4 border-l-secondary px-3 py-2 text-xs text-muted">
          <span aria-hidden className="text-secondary">ℹ</span>
          <span className="flex-1">
            Add a Lichess token for richer opening data (master-game stats, popular
            continuations, private study import).
          </span>
          <Link
            to="/settings#lichess"
            className="shrink-0 font-medium text-secondary hover:underline"
          >
            Settings →
          </Link>
        </div>
      )}

      {nothingMatched && (
        <div className="card border-dashed px-3 py-3 text-xs text-muted">
          No matches in your library or the starter catalog for “{searchText}”.
          {' '}
          <a
            href={lichessSearchUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            Search Lichess for “{searchText}” ↗
          </a>
          , copy the study URL, then paste it below.
        </div>
      )}

      <StudyImporter onImported={openStudy} />

      {drillLines.length > 0 && (
        <PracticeQueue
          lines={drillLines}
          onStart={(line) =>
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.set('drill', line.id);
              return next;
            })
          }
        />
      )}

      {studies.length > 0 && (
        <StudyLibrary
          studies={studies}
          onOpen={openStudy}
          onRemove={remove}
          searchQuery={searchText}
        />
      )}

      {HAS_CURATED ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
            {queryActive ? `Catalog matches for "${searchText}"` : 'Starter catalog'}
          </h3>
          <StudyCatalog
            importedIds={importedIds}
            onOpen={openStudy}
            searchQuery={searchText}
          />
        </section>
      ) : (
        studies.length === 0 && (
          <div className="card border-dashed px-3 py-6 text-center text-xs text-ink-500 dark:text-ink-400">
            No curated studies yet — paste a Lichess study URL above to add one.
          </div>
        )
      )}
    </div>
  );
}

/**
 * Practice queue surface — top of the page when the user has at least one
 * drill line. Sorts by scheduler priority (failed → stale 7d → review) and
 * shows the top 5 with a one-click "Drill now" CTA.
 */
function PracticeQueue({
  lines,
  onStart,
}: {
  lines: DrillLineRow[];
  onStart: (line: DrillLineRow) => void;
}) {
  const sorted = sortByDrillPriority(lines);
  const top = sorted.slice(0, 5);
  const headLine = nextDrillLine(lines);
  if (!headLine) return null;
  return (
    <section className="card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
          Practice queue ({lines.length})
        </h3>
        <button
          type="button"
          onClick={() => onStart(headLine)}
          className="btn-primary text-xs"
          title={`Start drilling: ${headLine.chapterTitle}`}
        >
          ▶ Drill next
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {top.map((l) => {
          const tag = priorityLabel(l);
          const accuracy =
            l.attempts > 0 ? `${Math.round((l.successes / l.attempts) * 100)}%` : '—';
          return (
            <li
              key={l.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded px-2 py-1 text-xs odd:bg-ink-100/60 dark:odd:bg-ink-800/40"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{l.chapterTitle}</span>
                <span className="text-ink-500 dark:text-ink-400">
                  {' · '}
                  {l.studyName} · {l.userSide}
                </span>
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  tag === 'failed'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : tag === 'stale'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                {tag}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-ink-500 dark:text-ink-400">
                {accuracy}
              </span>
              <button
                type="button"
                onClick={() => onStart(l)}
                className="btn-secondary shrink-0 px-2 py-0.5 text-[11px]"
                title="Drill this line"
              >
                Drill
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Helper for deep-link resolution: if a study isn't yet in Dexie, import it.
 * Always returns the lichess study id so the caller can route to it.
 */
async function ensureImported(studyId: string, curatedKey?: string): Promise<string> {
  if (await isStudyImported(studyId)) return studyId;
  try {
    await importStudy(studyId, { curatedKey });
    notifyStudiesChanged();
  } catch {
    // Swallow — viewer will show the parse error / library will still render.
  }
  return studyId;
}
