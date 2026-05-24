import type { PlanDay } from './template';

/**
 * Helpers for the Plan tab's Monday-rooted week. All dates are local —
 * the checklist resets on the user's Monday midnight, not UTC's.
 */

/** Day-of-week in 0=Mon..6=Sun (JS native Date.getDay is 0=Sun..6=Sat). */
export function localDayIndex(date: Date): PlanDay {
  const js = date.getDay(); // 0=Sun .. 6=Sat
  return ((js + 6) % 7) as PlanDay;
}

/** YYYY-MM-DD of the Monday that owns `date`'s local week. */
export function weekStartIso(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - localDayIndex(d));
  return toIsoDate(d);
}

/** ISO YYYY-MM-DD in local timezone (not UTC). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days difference between two local YYYY-MM-DDs (b - a). */
export function dayDiff(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Days until `targetIso`, computed from today's local midnight. Negative
 *  when the target has passed; 0 when it's today. */
export function daysUntil(targetIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dayDiff(toIsoDate(today), targetIso);
}

/**
 * Pull a target date out of free-text goal copy. Supports common phrasing
 * like "3 months", "in 6 weeks", "30 days from now", and "by Aug 15".
 * Returns ISO YYYY-MM-DD or undefined when nothing obvious matches.
 *
 * Kept intentionally narrow — anything ambiguous returns undefined and
 * the UI shows the creation date instead.
 */
export function parseTargetDate(text: string, now: Date = new Date()): string | undefined {
  const t = text.toLowerCase();

  // "N units" — units day | week | month | year.
  const numWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const numRe = /(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|week|month|year)s?/;
  const m = t.match(numRe);
  if (m) {
    const raw = m[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : numWords[raw];
    if (n && n > 0) {
      const days =
        m[2] === 'day' ? n
          : m[2] === 'week' ? n * 7
          : m[2] === 'month' ? Math.round(n * 30.44)
          : n * 365;
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + days);
      return toIsoDate(d);
    }
  }

  // "by Month D" / "by Month D YYYY". Date.parse tolerates this.
  const byRe = /by\s+([a-z]{3,9})\s+(\d{1,2})(?:[, ]+(\d{4}))?/i;
  const m2 = t.match(byRe);
  if (m2) {
    const year = m2[3] ? Number(m2[3]) : now.getFullYear();
    const parsed = new Date(`${m2[1]} ${m2[2]}, ${year}`);
    if (!Number.isNaN(parsed.getTime())) {
      // If the parsed date is already in the past relative to today,
      // roll forward to next year — interpreting "by Aug 15" said in
      // September as "by Aug 15 next year".
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      if (parsed < today) parsed.setFullYear(parsed.getFullYear() + 1);
      return toIsoDate(parsed);
    }
  }

  return undefined;
}
