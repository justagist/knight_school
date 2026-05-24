/**
 * Step 9 weekly plan template. Identical every week - no adaptive logic.
 *
 * Distribution rationale:
 *   - 3 drills + 2 analyses + 1 lesson + 1 guess review = 7 weekly items,
 *     one per day.
 *   - Daily puzzle prompt sits beside the day's anchored item, repeating
 *     every day.
 *   - Drills cluster on Mon / Wed / Fri so the user gets repetition
 *     across the week; analyses on Tue / Thu separate them; lesson Sat;
 *     guess review Sun. The exact day assignment is arbitrary but stable.
 */

/** 0 = Monday … 6 = Sunday. Matches what {@link localDayIndex} returns. */
export type PlanDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlanItemKind = 'drill' | 'analyze' | 'lesson' | 'guess' | 'puzzle';

export interface PlanItem {
  /** Stable id, unique within the template. Persisted in PlanCheckRow. */
  id: string;
  label: string;
  /** Internal route, when clicking the item should jump inside the app. */
  linkTo?: string;
  /** External URL - only the daily puzzle today. */
  linkExternal?: string;
  /** Day the item is anchored to. Past-day incomplete items roll
   *  forward to today; future-day items are visible but not actionable. */
  day: PlanDay;
  kind: PlanItemKind;
}

export const PUZZLE_URL = 'https://lichess.org/training';

// Labels stay short so they fit inside a single 7-column-grid cell on
// desktop (~140px wide). The card title carries the "this week"
// framing - items don't need to repeat it.
const PUZZLE_LABEL = '20 puzzles';
const DRILL_LABEL = 'Drill a line';
const ANALYZE_LABEL = 'Analyze a game';
const LESSON_LABEL = 'Study chapter';
const GUESS_LABEL = 'Guess-the-move';

export const WEEKLY_PLAN: PlanItem[] = [
  // Monday
  { id: 'drill-1', label: DRILL_LABEL, linkTo: '/openings', day: 0, kind: 'drill' },
  { id: 'puzzle-mon', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 0, kind: 'puzzle' },
  // Tuesday
  { id: 'analyze-1', label: ANALYZE_LABEL, linkTo: '/analyze', day: 1, kind: 'analyze' },
  { id: 'puzzle-tue', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 1, kind: 'puzzle' },
  // Wednesday
  { id: 'drill-2', label: DRILL_LABEL, linkTo: '/openings', day: 2, kind: 'drill' },
  { id: 'puzzle-wed', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 2, kind: 'puzzle' },
  // Thursday
  { id: 'analyze-2', label: ANALYZE_LABEL, linkTo: '/analyze', day: 3, kind: 'analyze' },
  { id: 'puzzle-thu', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 3, kind: 'puzzle' },
  // Friday
  { id: 'drill-3', label: DRILL_LABEL, linkTo: '/openings', day: 4, kind: 'drill' },
  { id: 'puzzle-fri', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 4, kind: 'puzzle' },
  // Saturday
  { id: 'lesson-1', label: LESSON_LABEL, linkTo: '/openings', day: 5, kind: 'lesson' },
  { id: 'puzzle-sat', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 5, kind: 'puzzle' },
  // Sunday
  { id: 'guess-1', label: GUESS_LABEL, linkTo: '/analyze?guess=1', day: 6, kind: 'guess' },
  { id: 'puzzle-sun', label: PUZZLE_LABEL, linkExternal: PUZZLE_URL, day: 6, kind: 'puzzle' },
];

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function itemsForDay(day: PlanDay): PlanItem[] {
  return WEEKLY_PLAN.filter((i) => i.day === day);
}
