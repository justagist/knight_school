import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StudyImporter } from '../lessons/StudyImporter';
import { StudyCatalog } from '../lessons/StudyCatalog';
import { StudyLibrary } from '../lessons/StudyLibrary';
import { StudyViewer } from '../lessons/StudyViewer';
import { useStudies } from '../lessons/useStudies';
import { CURATED_STUDIES, findStudyByKey, studyMatchesQuery } from '../lessons/catalog';
import { importStudy, isStudyImported } from '../lessons/lichessStudy';
import { notifyStudiesChanged } from '../lessons/useStudies';

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

  const studyId = params.get('study');
  const curatedKey = params.get('curated');
  const searchParam = params.get('search') ?? '';
  const chapterParam = Number(params.get('chapter') ?? '1');
  const chapterIdx = Number.isFinite(chapterParam) && chapterParam > 0 ? chapterParam - 1 : 0;

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

  if (selected) {
    return (
      <StudyViewer
        study={selected}
        initialChapter={chapterIdx}
        onChapterChange={setChapter}
        onBack={backToLibrary}
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
        <h1 className="text-xl font-semibold">Openings</h1>
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

      {nothingMatched && (
        <div className="card border-dashed px-3 py-3 text-xs text-ink-600 dark:text-ink-300">
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
