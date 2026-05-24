import { useCallback, useEffect, useState } from 'react';
import type { StudyRow } from '../db/db';
import { deleteStudy, listStudies } from '../db/studies';
import { deleteDrillLinesForStudy } from '../db/drillLines';
import { deletePositionsForStudy } from '../db/drillPositions';

/**
 * Reactive view of the studies table. Listens for the
 * `ks-studies-changed` window event so any code path that imports / removes
 * a study (catalog click, paste-import, delete button) can fan the update
 * out without prop-drilling a refresh callback everywhere.
 */
export function useStudies() {
  const [studies, setStudies] = useState<StudyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await listStudies();
    setStudies(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener('ks-studies-changed', onChange);
    return () => window.removeEventListener('ks-studies-changed', onChange);
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    // Cascade — drop the drill lines built from this study's chapters too,
    // otherwise the Practice queue keeps surfacing orphaned entries. Also
    // drop the position-pool index used by mixed / spot drills.
    await deleteDrillLinesForStudy(id);
    await deletePositionsForStudy(id);
    await deleteStudy(id);
    notifyStudiesChanged();
    window.dispatchEvent(new Event('ks-drills-changed'));
  }, []);

  return { studies, loading, refresh, remove };
}

export function notifyStudiesChanged(): void {
  window.dispatchEvent(new Event('ks-studies-changed'));
}
