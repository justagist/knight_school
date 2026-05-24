import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlan, rolloverItems, planStartDay } from '../plan/usePlan';
import {
  DAY_LABELS,
  DAY_LONG,
  WEEKLY_PLAN,
  itemsForDay,
  type PlanDay,
  type PlanItem,
} from '../plan/template';
import { daysUntil, weekRangeLabel } from '../plan/week';

export function PlanPage() {
  const plan = usePlan();
  const [editingGoal, setEditingGoal] = useState(false);
  // Which day column is expanded on desktop. Defaults to today but the
  // user can tap any other day's card to pull it into focus.
  const [focusedDay, setFocusedDay] = useState<PlanDay>(plan.today);

  if (plan.loading) {
    return <div className="card p-4 text-sm text-muted">Loading plan…</div>;
  }

  const startDay = planStartDay(plan.goal, plan.weekStart);
  // Items that count toward "this week" are those at or after the plan's
  // active start day. Setting a goal mid-week shouldn't pretend that
  // skipped earlier days were ever assigned.
  const activeItems =
    startDay === undefined
      ? []
      : WEEKLY_PLAN.filter((i) => i.day >= startDay);
  const totalThisWeek = activeItems.length;
  const doneThisWeek = activeItems.filter((i) => plan.completedIds.has(i.id)).length;
  // Rollover is a current-week-only concept - non-current weeks render
  // their template as-is without pulling items into a "today" column
  // (no day in those weeks is "today"). The `todayForView` passed down
  // becomes -1 for non-current weeks so no day matches.
  const rollover = plan.isCurrentWeek
    ? rolloverItems(plan.today, plan.completedIds, startDay)
    : [];
  const todayForView: PlanDay | -1 = plan.isCurrentWeek ? plan.today : -1;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Plan</h1>
        <p className="text-sm text-muted">
          Your goal and this week's practice checklist.
        </p>
      </header>

      {!plan.goal || editingGoal ? (
        <GoalEditor
          existing={plan.goal?.goalText ?? ''}
          onSave={async (text) => {
            await plan.setGoal(text);
            setEditingGoal(false);
          }}
          onCancel={plan.goal ? () => setEditingGoal(false) : undefined}
        />
      ) : (
        <GoalCard
          goal={plan.goal}
          onEdit={() => setEditingGoal(true)}
        />
      )}

      <WeekNav
        weekStart={plan.weekStart}
        isCurrentWeek={plan.isCurrentWeek}
        isPastWeek={plan.isPastWeek}
        isFutureWeek={plan.isFutureWeek}
        onStep={plan.stepWeek}
        onJumpToCurrent={plan.jumpToCurrentWeek}
      />

      <WeekSummary completed={doneThisWeek} total={totalThisWeek} readOnly={!plan.isCurrentWeek} />

      <DesktopChecklist
        today={todayForView}
        focused={focusedDay}
        onFocus={setFocusedDay}
        startDay={startDay}
        readOnly={!plan.isCurrentWeek}
        completedIds={plan.completedIds}
        rollover={rollover}
        onToggle={(id) => void plan.toggle(id)}
      />

      <MobileChecklist
        today={todayForView}
        startDay={startDay}
        readOnly={!plan.isCurrentWeek}
        completedIds={plan.completedIds}
        rollover={rollover}
        onToggle={(id) => void plan.toggle(id)}
      />

      {plan.archivedGoals.length > 0 && <ArchivedGoals goals={plan.archivedGoals} />}
    </div>
  );
}

function GoalCard({
  goal,
  onEdit,
}: {
  goal: { goalText: string; createdAt: number; targetDate?: string };
  onEdit: () => void;
}) {
  const createdLabel = new Date(goal.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const target = goal.targetDate;
  const remaining = target ? daysUntil(target) : null;
  return (
    <section className="card flex flex-col gap-2 border-l-4 border-l-accent bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            Your goal
          </p>
          <p className="mt-1 text-lg font-semibold leading-snug text-primary">
            {goal.goalText}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-xs text-secondary hover:underline"
        >
          Edit goal
        </button>
      </div>
      <p className="text-xs text-muted">
        {target ? (
          remaining! >= 0 ? (
            <>
              <span className="font-medium text-primary">{remaining}</span>{' '}
              {remaining === 1 ? 'day' : 'days'} remaining (target {target}).
            </>
          ) : (
            <>Target {target} passed {Math.abs(remaining!)} days ago.</>
          )
        ) : (
          <>Started {createdLabel}.</>
        )}
      </p>
    </section>
  );
}

function GoalEditor({
  existing,
  onSave,
  onCancel,
}: {
  existing: string;
  onSave: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(existing);
  const [saving, setSaving] = useState(false);

  return (
    <section className="card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold">
        {existing ? 'Edit your goal' : 'Set a goal'}
      </h2>
      <p className="text-xs text-muted">
        Anything in plain language. The app will pull a target date out of
        phrasing like "3 months" or "by Aug 15" when it can.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder='e.g. "reach 1500 rapid in 3 months" · "stop hanging pieces" · "learn the London as White"'
        className="input min-h-[5rem] resize-y text-sm"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(text);
            } finally {
              setSaving(false);
            }
          }}
          className="btn-primary text-xs"
        >
          {saving ? 'Saving…' : 'Save goal'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost text-xs"
            disabled={saving}
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

function WeekSummary({
  completed,
  total,
  readOnly,
}: {
  completed: number;
  total: number;
  readOnly: boolean;
}) {
  return (
    <section className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted">
      <span>{readOnly ? 'Preview' : 'This week'}</span>
      <span className="font-mono tabular-nums text-primary">
        {completed} / {total} items completed
      </span>
    </section>
  );
}

function WeekNav({
  weekStart,
  isCurrentWeek,
  isPastWeek,
  isFutureWeek,
  onStep,
  onJumpToCurrent,
}: {
  weekStart: string;
  isCurrentWeek: boolean;
  isPastWeek: boolean;
  isFutureWeek: boolean;
  onStep: (n: number) => void;
  onJumpToCurrent: () => void;
}) {
  const label = weekRangeLabel(weekStart);
  const tag = isPastWeek ? 'Past' : isFutureWeek ? 'Upcoming' : 'Current';
  return (
    <nav className="card flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="btn-secondary inline-flex h-10 items-center gap-1 px-3 text-sm"
          aria-label="Previous week"
          title="Previous week"
        >
          <span aria-hidden className="text-base font-bold text-primary">←</span>
          <span className="hidden sm:inline">Prev</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-semibold text-primary">{label}</div>
          <span
            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              isCurrentWeek
                ? 'bg-accent/15 text-accent'
                : 'bg-surface-2 text-muted'
            }`}
          >
            {tag} week
          </span>
        </div>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="btn-secondary inline-flex h-10 items-center gap-1 px-3 text-sm"
          aria-label="Next week"
          title="Next week"
        >
          <span className="hidden sm:inline">Next</span>
          <span aria-hidden className="text-base font-bold text-primary">→</span>
        </button>
      </div>
      {!isCurrentWeek && (
        <button
          type="button"
          onClick={onJumpToCurrent}
          className="btn-primary text-xs"
        >
          Jump to this week
        </button>
      )}
    </nav>
  );
}

interface DayProps {
  /** -1 when the viewed week isn't the current week - no day matches. */
  today: PlanDay | -1;
  startDay: PlanDay | undefined;
  readOnly: boolean;
  completedIds: Set<string>;
  rollover: PlanItem[];
  onToggle: (id: string) => void;
}

interface DesktopDayProps extends DayProps {
  focused: PlanDay;
  onFocus: (day: PlanDay) => void;
}

function DesktopChecklist({
  today,
  focused,
  onFocus,
  startDay,
  readOnly,
  completedIds,
  rollover,
  onToggle,
}: DesktopDayProps) {
  // Build a CSS grid template where the focused column gets 2fr and the
  // others share 1fr each. Six rows of `1fr` plus one row of `2fr` add
  // up to 8 tracks of fr, so the focused column reads about 2× wider.
  const template = (DAY_LABELS.map((_, i) =>
    i === focused ? 'minmax(0,2fr)' : 'minmax(0,1fr)',
  )).join(' ');
  return (
    <section className="hidden md:block">
      <div className="grid gap-2" style={{ gridTemplateColumns: template }}>
        {(DAY_LABELS.map((_, i) => i as PlanDay)).map((day) => (
          <DayColumn
            key={day}
            day={day}
            isToday={day === today}
            today={today}
            startDay={startDay}
            readOnly={readOnly}
            isFocused={day === focused}
            onFocus={() => onFocus(day)}
            completedIds={completedIds}
            rollover={day === today ? rollover : []}
            onToggle={onToggle}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-faint">
        Tap a day's card to expand it. Today is opened by default.
      </p>
    </section>
  );
}

function MobileChecklist({ today, startDay, readOnly, completedIds, rollover, onToggle }: DayProps) {
  return (
    <section className="flex flex-col gap-2 md:hidden">
      {(DAY_LABELS.map((_, i) => i as PlanDay)).map((day) => (
        <DayAccordion
          key={day}
          day={day}
          isToday={day === today}
          today={today}
          startDay={startDay}
          readOnly={readOnly}
          completedIds={completedIds}
          rollover={day === today ? rollover : []}
          onToggle={onToggle}
        />
      ))}
    </section>
  );
}

function DayColumn({
  day,
  isToday,
  isFocused,
  today,
  startDay,
  readOnly,
  completedIds,
  rollover,
  onToggle,
  onFocus,
}: {
  day: PlanDay;
  isToday: boolean;
  isFocused: boolean;
  today: PlanDay | -1;
  startDay: PlanDay | undefined;
  readOnly: boolean;
  completedIds: Set<string>;
  rollover: PlanItem[];
  onToggle: (id: string) => void;
  onFocus: () => void;
}) {
  const items = itemsForDay(day);
  // When viewing a non-current week, no day is "today" - readOnly is
  // true and past/future flags are irrelevant for rollover. Items still
  // render their checked state from the stored checks.
  const future = today !== -1 && day > today;
  const past = today !== -1 && day < today;
  // Days BEFORE the plan's active start day this week are pre-plan -
  // treat them like future days (visible, not actionable, no rollover).
  const beforePlan = startDay !== undefined && day < startDay;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFocus();
        }
      }}
      className={`card flex cursor-pointer flex-col gap-2 p-2 text-xs transition-shadow ${
        isFocused ? 'shadow-md' : 'hover:shadow-sm'
      } ${isToday ? 'border-accent ring-1 ring-accent/40' : ''}`}
      aria-pressed={isFocused}
      aria-label={`${DAY_LONG[day]}${isToday ? ', today' : ''}${isFocused ? ', focused' : ''}`}
    >
      <header className="flex items-baseline justify-between gap-1 px-1">
        <span className={`font-semibold ${isToday ? 'text-accent' : ''}`}>
          {DAY_LABELS[day]}
        </span>
        {isToday && <span className="text-[10px] uppercase tracking-wide text-accent">Today</span>}
      </header>
      {beforePlan ? (
        <p className="px-1 pt-1 text-[11px] italic text-faint">
          Before plan start.
        </p>
      ) : (
        <ul
          className="flex flex-col gap-1"
          onClick={(e) => {
            // Don't focus the column when toggling a checkbox / clicking a
            // link inside it - those are their own actions.
            e.stopPropagation();
          }}
        >
          {items.map((item) => {
            const done = completedIds.has(item.id);
            // Past-day items still uncompleted have rolled forward to
            // today's column - hide them here so the actionable copy
            // doesn't appear twice. Only applies in the current week.
            if (past && !done) return null;
            return (
              <ItemRow
                key={item.id}
                item={item}
                checked={done}
                disabled={future || readOnly}
                onToggle={() => onToggle(item.id)}
              />
            );
          })}
          {rollover.map((item) => (
            <ItemRow
              key={`rollover-${item.id}`}
              item={item}
              checked={false}
              disabled={readOnly}
              fromDay={item.day}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DayAccordion({
  day,
  isToday,
  today,
  startDay,
  readOnly,
  completedIds,
  rollover,
  onToggle,
}: {
  day: PlanDay;
  isToday: boolean;
  today: PlanDay | -1;
  startDay: PlanDay | undefined;
  readOnly: boolean;
  completedIds: Set<string>;
  rollover: PlanItem[];
  onToggle: (id: string) => void;
}) {
  const items = itemsForDay(day);
  const future = today !== -1 && day > today;
  const past = today !== -1 && day < today;
  const beforePlan = startDay !== undefined && day < startDay;
  const doneCount = items.filter((i) => completedIds.has(i.id)).length;
  return (
    <details
      open={isToday}
      className={`card overflow-hidden ${isToday ? 'border-accent ring-1 ring-accent/40' : ''}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className={`font-semibold ${isToday ? 'text-accent' : ''}`}>
          {DAY_LONG[day]}
          {isToday && (
            <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
              Today
            </span>
          )}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {beforePlan ? '-' : `${doneCount}/${items.length}`}
          {rollover.length > 0 && ` +${rollover.length}`}
        </span>
      </summary>
      {beforePlan ? (
        <p className="border-t border-border px-3 py-2 text-[11px] italic text-faint">
          Before plan start.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 border-t border-border px-3 py-2 text-xs">
          {items.map((item) => {
            const done = completedIds.has(item.id);
            if (past && !done) return null;
            return (
              <ItemRow
                key={item.id}
                item={item}
                checked={done}
                disabled={future || readOnly}
                onToggle={() => onToggle(item.id)}
              />
            );
          })}
          {rollover.map((item) => (
            <ItemRow
              key={`rollover-${item.id}`}
              item={item}
              checked={false}
              disabled={readOnly}
              fromDay={item.day}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </ul>
      )}
    </details>
  );
}

function ItemRow({
  item,
  checked,
  disabled,
  fromDay,
  onToggle,
}: {
  item: PlanItem;
  checked: boolean;
  disabled?: boolean;
  fromDay?: PlanDay;
  onToggle: () => void;
}) {
  const labelText = item.linkExternal ? `${item.label} ↗` : item.label;
  const labelEl = item.linkTo ? (
    <Link
      to={item.linkTo}
      className="block truncate text-secondary hover:underline"
      title={item.label}
    >
      {labelText}
    </Link>
  ) : item.linkExternal ? (
    <a
      href={item.linkExternal}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate text-secondary hover:underline"
      title={item.label}
    >
      {labelText}
    </a>
  ) : (
    <span className="block truncate">{labelText}</span>
  );

  return (
    <li
      className={`flex min-h-[2.75rem] items-start gap-1 rounded ${
        checked ? 'text-muted line-through' : ''
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {/* 44×44 tap surface around the native checkbox - meets the
          mobile-tap-target spec without changing the visual size. */}
      <label
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 accent-accent"
          aria-label={item.label}
        />
      </label>
      {/* Stack label + optional "from <Day>" caption vertically so the
          label gets the full remaining width. In a 7-column desktop
          layout each cell is only ~140px; inline annotations truncated
          the label down to single characters. */}
      <div className="min-w-0 flex-1 py-2">
        {labelEl}
        {fromDay !== undefined && (
          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
            from {DAY_LABELS[fromDay]}
          </span>
        )}
      </div>
    </li>
  );
}

function ArchivedGoals({ goals }: { goals: { id: string; goalText: string; createdAt: number }[] }) {
  return (
    <details className="card mt-2 p-3 text-xs text-muted">
      <summary className="cursor-pointer font-semibold">
        Previous goals ({goals.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {goals.map((g) => {
          const d = new Date(g.createdAt).toLocaleDateString();
          return (
            <li key={g.id} className="flex flex-col gap-0.5 border-l border-border pl-2">
              <span>{g.goalText}</span>
              <span className="text-[11px] text-faint">Set {d}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
