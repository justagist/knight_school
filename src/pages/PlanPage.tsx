import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlan, rolloverItems } from '../plan/usePlan';
import {
  DAY_LABELS,
  DAY_LONG,
  WEEKLY_PLAN,
  itemsForDay,
  type PlanDay,
  type PlanItem,
} from '../plan/template';
import { daysUntil } from '../plan/week';

export function PlanPage() {
  const plan = usePlan();
  const [editingGoal, setEditingGoal] = useState(false);

  if (plan.loading) {
    return <div className="card p-4 text-sm text-muted">Loading plan…</div>;
  }

  const totalThisWeek = WEEKLY_PLAN.length;
  const doneThisWeek = plan.completedIds.size;
  const rollover = rolloverItems(plan.today, plan.completedIds);

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

      <WeekSummary completed={doneThisWeek} total={totalThisWeek} />

      <DesktopChecklist
        today={plan.today}
        completedIds={plan.completedIds}
        rollover={rollover}
        onToggle={(id) => void plan.toggle(id)}
      />

      <MobileChecklist
        today={plan.today}
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
    <section className="card flex flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-medium leading-snug">{goal.goalText}</p>
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

function WeekSummary({ completed, total }: { completed: number; total: number }) {
  return (
    <section className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted">
      <span>This week</span>
      <span className="font-mono tabular-nums text-primary">
        {completed} / {total} items completed
      </span>
    </section>
  );
}

interface DayProps {
  today: PlanDay;
  completedIds: Set<string>;
  rollover: PlanItem[];
  onToggle: (id: string) => void;
}

function DesktopChecklist({ today, completedIds, rollover, onToggle }: DayProps) {
  return (
    <section className="hidden md:block">
      <div className="grid grid-cols-7 gap-2">
        {(DAY_LABELS.map((_, i) => i as PlanDay)).map((day) => (
          <DayColumn
            key={day}
            day={day}
            isToday={day === today}
            today={today}
            completedIds={completedIds}
            rollover={day === today ? rollover : []}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function MobileChecklist({ today, completedIds, rollover, onToggle }: DayProps) {
  return (
    <section className="flex flex-col gap-2 md:hidden">
      {(DAY_LABELS.map((_, i) => i as PlanDay)).map((day) => (
        <DayAccordion
          key={day}
          day={day}
          isToday={day === today}
          today={today}
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
  today,
  completedIds,
  rollover,
  onToggle,
}: {
  day: PlanDay;
  isToday: boolean;
  today: PlanDay;
  completedIds: Set<string>;
  rollover: PlanItem[];
  onToggle: (id: string) => void;
}) {
  const items = itemsForDay(day);
  const future = day > today;
  const past = day < today;
  return (
    <div
      className={`card flex flex-col gap-2 p-2 text-xs ${
        isToday ? 'border-accent ring-1 ring-accent/40' : ''
      }`}
    >
      <header className="flex items-baseline justify-between gap-1 px-1">
        <span className={`font-semibold ${isToday ? 'text-accent' : ''}`}>
          {DAY_LABELS[day]}
        </span>
        {isToday && <span className="text-[10px] uppercase tracking-wide text-accent">Today</span>}
      </header>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const done = completedIds.has(item.id);
          // Past-day items still uncompleted have rolled forward to
          // today's column — render a placeholder here so the user
          // doesn't see the same actionable row twice on screen.
          if (past && !done) {
            return <MovedRow key={item.id} item={item} />;
          }
          return (
            <ItemRow
              key={item.id}
              item={item}
              checked={done}
              disabled={future}
              onToggle={() => onToggle(item.id)}
            />
          );
        })}
        {rollover.map((item) => (
          <ItemRow
            key={`rollover-${item.id}`}
            item={item}
            checked={false}
            disabled={false}
            fromDay={item.day}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function DayAccordion({
  day,
  isToday,
  today,
  completedIds,
  rollover,
  onToggle,
}: {
  day: PlanDay;
  isToday: boolean;
  today: PlanDay;
  completedIds: Set<string>;
  rollover: PlanItem[];
  onToggle: (id: string) => void;
}) {
  const items = itemsForDay(day);
  const future = day > today;
  const past = day < today;
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
          {doneCount}/{items.length}
          {rollover.length > 0 && ` +${rollover.length}`}
        </span>
      </summary>
      <ul className="flex flex-col gap-1 border-t border-border px-3 py-2 text-xs">
        {items.map((item) => {
          const done = completedIds.has(item.id);
          if (past && !done) {
            return <MovedRow key={item.id} item={item} />;
          }
          return (
            <ItemRow
              key={item.id}
              item={item}
              checked={done}
              disabled={future}
              onToggle={() => onToggle(item.id)}
            />
          );
        })}
        {rollover.map((item) => (
          <ItemRow
            key={`rollover-${item.id}`}
            item={item}
            checked={false}
            disabled={false}
            fromDay={item.day}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </ul>
    </details>
  );
}

/**
 * Placeholder rendered in a past day's slot when that day's item is
 * still incomplete — the actionable copy now lives in today's
 * column via the rollover prop. Avoids showing the same item twice.
 */
function MovedRow({ item }: { item: PlanItem }) {
  return (
    <li className="flex min-h-[2.25rem] items-center gap-2 rounded px-1 py-1 text-muted">
      <span aria-hidden className="inline-block h-4 w-4 shrink-0" />
      <span className="flex-1 truncate italic">{item.label}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint">
        moved to today
      </span>
    </li>
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
  const link = item.linkTo ? (
    <Link
      to={item.linkTo}
      className="flex-1 truncate text-secondary hover:underline"
      title={item.label}
    >
      {item.label}
    </Link>
  ) : item.linkExternal ? (
    <a
      href={item.linkExternal}
      target="_blank"
      rel="noreferrer"
      className="flex-1 truncate text-secondary hover:underline"
      title={item.label}
    >
      {item.label} ↗
    </a>
  ) : (
    <span className="flex-1 truncate">{item.label}</span>
  );

  return (
    <li
      className={`flex min-h-[2.25rem] items-center gap-2 rounded px-1 py-1 ${
        checked ? 'text-muted line-through' : ''
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-accent"
        aria-label={item.label}
      />
      {link}
      {fromDay !== undefined && (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
          from {DAY_LABELS[fromDay]}
        </span>
      )}
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
