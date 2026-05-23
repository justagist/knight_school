import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StudyImporter } from '../lessons/StudyImporter';
import { StudyCatalog } from '../lessons/StudyCatalog';
import { StudyLibrary } from '../lessons/StudyLibrary';
import { StudyViewer } from '../lessons/StudyViewer';
import { useStudies } from '../lessons/useStudies';
import { CURATED_STUDIES, findStudyByKey, findStudyByOpeningName } from '../lessons/catalog';
import { importStudy, isStudyImported } from '../lessons/lichessStudy';
import { notifyStudiesChanged } from '../lessons/useStudies';

/**
 * Openings tab. Two modes:
 *   - Library mode (default): paste-import + curated catalog + imported list
 *   - Viewer mode: a selected study with chapter navigation
 *
 * Deep links the Analyze view uses:
 *   /openings?study=<lichess-id>             open this specific study
 *   /openings?curated=<catalog-key>          open by catalog key (imports first if needed)
 *   /openings?name=<opening-name>            best-effort match against curated `matches` field
 *   /openings?chapter=<n>                    1-based chapter to open (paired with the above)
 *
 * The URL is the single source of truth for "what's selected" — back/forward
 * browser nav and shareable links both work for free.
 */
export function OpeningsPage() {
  const [params, setParams] = useSearchParams();
  const { studies, loading, remove } = useStudies();

  const studyId = params.get('study');
  const curatedKey = params.get('curated');
  const openingName = params.get('name');
  const chapterParam = Number(params.get('chapter') ?? '1');
  const chapterIdx = Number.isFinite(chapterParam) && chapterParam > 0 ? chapterParam - 1 : 0;

  // Resolve curated/name params to a concrete study id once, then re-write
  // the URL so subsequent renders take the simpler `study=` path.
  useEffect(() => {
    if (studyId || loading) return;
    if (curatedKey) {
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
      return;
    }
    if (openingName) {
      const entry = findStudyByOpeningName(openingName);
      if (!entry) {
        // No curated match — show the library so the user can paste a URL.
        setParams((p) => {
          const next = new URLSearchParams(p);
          next.delete('name');
          return next;
        });
        return;
      }
      void ensureImported(entry.studyId, entry.key).then((id) => {
        setParams((p) => {
          const next = new URLSearchParams(p);
          next.delete('name');
          next.set('study', id);
          return next;
        });
      });
    }
  }, [studyId, curatedKey, openingName, loading, setParams]);

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
      next.delete('name');
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
  const noMatchForName =
    !!openingName && !CURATED_STUDIES.some((s) => findStudyByOpeningName(openingName)?.key === s.key);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Openings</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Import a Lichess study or pick from the starter catalog.
        </p>
      </div>

      {noMatchForName && (
        <div className="card border-amber-300 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:text-amber-300">
          No curated study matches “{openingName}”. Paste a Lichess study URL below to add your own.
        </div>
      )}

      <StudyImporter onImported={openStudy} />

      {studies.length > 0 && (
        <StudyLibrary studies={studies} onOpen={openStudy} onRemove={remove} />
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
          Starter catalog
        </h3>
        <StudyCatalog importedIds={importedIds} onOpen={openStudy} />
      </section>
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
