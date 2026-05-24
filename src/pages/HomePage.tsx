import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Landing / Home page. Answers three questions in order:
 *   1. What is KnightSchool?
 *   2. How do I use it?
 *   3. How do I start?
 *
 * Intentionally calm and textual - no hero imagery, no animations, no
 * marketing language. Matches Elle's tone rules: direct, concise, no
 * exclamation points, no emoji. Max-width capped at 960px so the page
 * doesn't read as empty on wide screens.
 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-[960px] space-y-10 py-6 sm:space-y-16 sm:py-10">
      <Hero />
      <CardGrid />
      <HowItWorks />
      <WhyList />
      <FooterCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
        KnightSchool
      </h1>
      <p className="text-base text-muted sm:text-lg">Chess made easy.</p>
      <p className="max-w-prose text-sm text-muted sm:text-base">
        Analyze your games, drill openings, and chat with Elle - your AI chess
        assistant. Everything runs in your browser.
      </p>
    </section>
  );
}

interface CardDef {
  icon: ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
}

function CardGrid() {
  const cards: CardDef[] = [
    {
      icon: <BoardIcon />,
      title: 'Analyze a game',
      description:
        'Paste a PGN or try a sample game. Get engine evaluations, move classifications, and explanations from Elle.',
      ctaLabel: 'Open Analyze',
      ctaTo: '/analyze',
    },
    {
      icon: <BookIcon />,
      title: 'Study with Elle',
      description:
        'Import Lichess Studies or browse the starter catalog. Drill main lines, read author notes, and ask Elle anything along the way.',
      ctaLabel: 'Open Study',
      ctaTo: '/study',
    },
    {
      icon: <CalendarIcon />,
      title: 'Plan your improvement',
      description:
        'Set a goal and follow a weekly practice plan that adapts to what you\'re working on.',
      ctaLabel: 'Open Plan',
      ctaTo: '/plan',
    },
  ];
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((c) => (
        <article key={c.title} className="card flex flex-col gap-3 p-4">
          <div className="text-accent">{c.icon}</div>
          <h2 className="text-base font-semibold text-primary">{c.title}</h2>
          <p className="flex-1 text-sm text-muted">{c.description}</p>
          <Link to={c.ctaTo} className="text-sm font-medium text-accent hover:underline">
            {c.ctaLabel} →
          </Link>
        </article>
      ))}
    </section>
  );
}

function HowItWorks() {
  // Each step is a single sentence. Linkable words point at the relevant
  // destination so users can jump straight in.
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-primary">How it works</h2>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Step
          n={1}
          body={
            <>
              <strong className="text-primary">Add an LLM key</strong> (optional but
              recommended) - Elle needs a key to chat. Groq is free and works well
              for getting started.{' '}
              <Link to="/settings" className="text-secondary hover:underline">
                Settings → Elle
              </Link>
              .
            </>
          }
        />
        <Step
          n={2}
          body={
            <>
              <strong className="text-primary">Load a game</strong> - paste a PGN,
              upload a <code className="text-faint">.pgn</code> file, or try one of
              the classics from{' '}
              <Link to="/analyze" className="text-secondary hover:underline">
                Analyze
              </Link>
              .
            </>
          }
        />
        <Step
          n={3}
          body={
            <>
              <strong className="text-primary">Step through it</strong> - see how
              each move was rated and ask Elle to explain anything.
            </>
          }
        />
        <Step
          n={4}
          body={
            <>
              <strong className="text-primary">Train and improve</strong> - import
              an{' '}
              <Link to="/study" className="text-secondary hover:underline">
                opening study
              </Link>
              , set a goal, follow your plan.
            </>
          }
        />
      </ol>
    </section>
  );
}

function Step({ n, body }: { n: number; body: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-surface-1 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
        {n}
      </span>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function WhyList() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-primary">Why KnightSchool</h2>
      <ul className="grid grid-cols-1 gap-1.5 text-sm text-muted md:grid-cols-2">
        <Bullet>Runs entirely in your browser - your games and chats stay on your device.</Bullet>
        <Bullet>Bring your own LLM key (Groq has a free tier).</Bullet>
        <Bullet>Open-source, self-hostable.</Bullet>
        <Bullet>Stockfish for engine analysis. Lichess for opening data.</Bullet>
        <Bullet>Works offline once loaded (except chat and new Lichess fetches).</Bullet>
      </ul>
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="text-accent">·</span>
      <span>{children}</span>
    </li>
  );
}

function FooterCta() {
  return (
    <section className="flex flex-col items-center gap-2 text-center">
      <Link
        to="/analyze"
        className="btn-primary px-5 py-2.5 text-sm font-semibold"
      >
        Get started - load a game
      </Link>
      <Link to="/settings" className="text-xs text-secondary hover:underline">
        Or set up Elle first → Settings
      </Link>
    </section>
  );
}

/* --- Icons. Outline style, same visual language as the BottomTabBar so
       Home reads as part of the same chrome. --- */

function BoardIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 9.5h17M3.5 15.5h17M9.5 3.5v17M15.5 3.5v17" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4.5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4z" />
      <path d="M20 4.5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10.5h17" />
      <path d="M8 3.5v4M16 3.5v4" />
    </svg>
  );
}
