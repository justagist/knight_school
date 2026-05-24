import { db } from './db';

export interface StorageEstimateResult {
  /** Bytes used by all browser storage scoped to this origin (best effort). */
  usage: number;
  /** Estimated quota - may be undefined or very large depending on browser. */
  quota: number;
  /** True if navigator.storage.estimate() isn't supported in this browser. */
  unsupported: boolean;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, unsupported: true };
  }
  try {
    const est = await navigator.storage.estimate();
    return {
      usage: est.usage ?? 0,
      quota: est.quota ?? 0,
      unsupported: false,
    };
  } catch {
    return { usage: 0, quota: 0, unsupported: true };
  }
}

/**
 * Wipe every Dexie table KnightSchool owns. Does NOT clear non-Dexie state
 * (localStorage settings, theme prefs, last-PGN cache). Those are cheap to
 * recover and the "danger zone" semantics of the button are about user data
 * (analysis, keys, future chats) - not look-and-feel.
 */
export async function clearAllData(): Promise<void> {
  const d = db();
  await d.transaction(
    'rw',
    [
      d.positionEvals,
      d.apiKeys,
      d.providerConfig,
      d.llmGlobal,
      d.chatThreads,
      d.chatMessages,
      d.moveCommentaries,
      d.guessRecords,
      d.explorerEntries,
      d.lichessAuth,
      d.studies,
      d.drillLines,
      d.drillAttempts,
      d.drillPositions,
      d.drillSessions,
      d.planGoals,
      d.planChecks,
    ],
    async () => {
      await Promise.all([
        d.positionEvals.clear(),
        d.apiKeys.clear(),
        d.providerConfig.clear(),
        d.llmGlobal.clear(),
        d.chatThreads.clear(),
        d.chatMessages.clear(),
        d.moveCommentaries.clear(),
        d.guessRecords.clear(),
        d.explorerEntries.clear(),
        d.lichessAuth.clear(),
        d.studies.clear(),
        d.drillLines.clear(),
        d.drillAttempts.clear(),
        d.drillPositions.clear(),
        d.drillSessions.clear(),
        d.planGoals.clear(),
        d.planChecks.clear(),
      ]);
    },
  );
  // Tell the rest of the app the world just changed so OpeningsPage,
  // PlanPage, and the chat host re-pull instead of rendering stale data.
  window.dispatchEvent(new Event('ks-studies-changed'));
  window.dispatchEvent(new Event('ks-drills-changed'));
  window.dispatchEvent(new Event('ks-plan-changed'));
}

/** Format bytes as a short MB / GB string for the storage indicator. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
