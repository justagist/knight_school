import { useCallback, useEffect, useState } from 'react';
import type { StudyRow } from '../db/db';
import { deleteStudy, listStudies } from '../db/studies';

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
    await deleteStudy(id);
    notifyStudiesChanged();
  }, []);

  return { studies, loading, refresh, remove };
}

export function notifyStudiesChanged(): void {
  window.dispatchEvent(new Event('ks-studies-changed'));
}
