# KnightSchool — Canonical Specification

This document is the authoritative spec for KnightSchool. It captures the
product surface, architecture, conventions, and constraints that all
implementation work draws from. When this conflicts with `DEVELOPMENT.md`,
`README.md`, or any inline note, **this document wins** — those are
supporting / reference docs.

The MVP was built in ten numbered steps (recorded in
`MEMORY/project_build_order.md`). Steps 1–9 are complete; Step 10 is the
polish + release pass.

## 1. Product

A client-side **chess learning PWA**, MIT-licensed, deployed to Cloudflare
Pages from GitHub. Built for solo use — no auth, no multi-user features,
no backend. The user owns their data; everything sensitive (API keys,
chat history, game evals, drill stats) lives in the user's browser via
IndexedDB.

Five surfaces:

- **Analyze** — paste a PGN, walk it move-by-move with Stockfish, see
  classifications, the eval graph, top engine lines, and per-move
  commentary from Elle.
- **Openings** — import Lichess Studies, drill chapter lines or mixed
  pools, browse Lichess Opening Explorer enrichment when a token is
  configured.
- **Plan** — free-text goal + fixed weekly checklist.
- **Settings** — provider keys, engine, sounds, board, storage,
  Lichess token.
- **Elle (chat panel)** — always available as a floating button;
  context-aware across screens.

## 2. Stack

| Layer    | Choice                                                            |
|----------|-------------------------------------------------------------------|
| UI       | React 18 + TypeScript + Vite                                      |
| Styling  | Tailwind CSS, CSS-variable tokens (Slate & Amber)                 |
| Router   | `react-router-dom`                                                |
| Board    | `@lichess-org/chessground` (render) + `chess.js` v1.4 (rules)     |
| Variations | `chessops` (variation-tree walk; chess.js flattens)             |
| Engine   | Stockfish (WASM) in a Web Worker; UCI state machine               |
| Storage  | `Dexie.js` v10 over IndexedDB; `dexie-export-import` for backups  |
| LLM      | Thin `LLMProvider` interface; five direct provider implementations|
| PWA      | `vite-plugin-pwa`, `registerType: 'prompt'`                       |
| Deploy   | Cloudflare Pages auto-deploy on push to `main`                    |

### Constraints

- **No backend.** No Cloudflare Worker proxy, no edge function, no
  database. All third-party calls go direct from the browser.
- **No telemetry, no analytics.** The only network traffic outside
  Stockfish (which is local WASM) is to the Lichess APIs and the
  user's chosen LLM provider.
- **Node 20+** required for local dev; an `.nvmrc` pins this. The
  `crypto.randomUUID` fallback in `src/lib/uuid.ts` is a dev-only
  workaround for LAN HTTP testing and will be removed once the
  phone-testing cycle is over (memory: `project_remove_uuid_fallback`).

## 3. Architecture

```
knight_school/
├── public/              # static assets, _headers, _redirects, PWA icons,
│                        #   /engine/* Stockfish workers, /theme-init.js
├── scripts/             # ECO build, dev server, flex audit
├── src/
│   ├── App.tsx          # router
│   ├── main.tsx
│   ├── analyze/         # Analyze view + game state + classification overlay
│   ├── analysis/        # full-game analysis pipeline + classifier
│   ├── chat/            # ChatHost, ChatPanel, useChat, ChatContextProvider
│   ├── components/      # shared UI (Board, Header, BottomTabBar, EvalGraph…)
│   ├── data/            # bundled ECO opening database
│   ├── db/              # Dexie schema + per-table CRUD facades
│   ├── drill/           # per-chapter + mixed/spot drill state machines
│   ├── engine/          # Stockfish handle + UCI state machine
│   ├── explorer/        # Lichess Masters DB client
│   ├── guess/           # guess-the-move state + persistence
│   ├── lessons/         # Lichess Study import + viewer
│   ├── lib/             # shared helpers (pgn, moveToUci, safeUrl, uuid)
│   ├── llm/             # provider adapters + chat call + session key store
│   ├── pages/           # one component per route
│   ├── plan/            # Step 9: goals + weekly template + week helpers
│   ├── settings/        # SettingsProvider + theme tokens
│   ├── sounds/          # move/capture/check/game-end audio
│   └── theme/           # light/dark/system ThemeProvider
├── index.html
├── vite.config.ts
└── tsconfig.json
```

### Routing

`react-router-dom`. Six routes:

| Path        | Component      | Purpose                                                                   |
|-------------|----------------|---------------------------------------------------------------------------|
| `/`         | `HomePage`     | landing — links into the four primary tabs                                |
| `/analyze`  | `AnalyzePage`  | PGN analysis + classification + Elle hooks                                |
| `/study`    | `OpeningsPage` | studies, drills, mixed pool, practice queue. Hosts the inline StudyViewer |
| `/openings` | (redirect)     | legacy alias — `<Navigate to="/study" replace>` so old deep-links survive |
| `/plan`     | `PlanPage`     | goal + weekly checklist                                                   |
| `/settings` | `SettingsPage` | providers, engine, sounds, board, storage                                 |
| `*`         | `NotFoundPage` | 404                                                                       |

The viewer for an imported study renders **inline** inside
`OpeningsPage` (`StudyViewer` is a child component, not a routed
page); a study is selected via the `?study=<id>` query param. Routes
are split with `React.lazy()` so the initial bundle stays Home-only.

`Header` shows the desktop nav; `BottomTabBar` shows mobile primary nav.

### State

- **Per-screen state** lives in hooks (`useGame`, `useEngine`,
  `useGameAnalysis`, `useDrill`, `useMixedDrill`, `useGuessMode`,
  `usePlan`).
- **Persistent state** lives in Dexie. Every write fires a window
  CustomEvent (`ks-studies-changed`, `ks-drills-changed`,
  `ks-plan-changed`) so other tabs / hooks refresh without polling.
- **Session-only state** (the in-memory LLM key store) lives in
  `src/llm/sessionKeyStore.ts` — a module-level Map cleared on tab
  close. Reads in `src/db/apiKeys.ts` overlay it on the Dexie store.

## 4. Color scheme — Slate & Amber

Tokens are defined as CSS variables and consumed via Tailwind utility
classes (`text-primary`, `bg-surface-1`, `border-accent`, etc.). Never
hard-code `#xxxxxx` outside the token definitions. The palette:

| Token            | Role                                                            |
|------------------|-----------------------------------------------------------------|
| `--bg-base`      | App background                                                  |
| `--bg-surface-1` | Card / panel background                                         |
| `--bg-surface-2` | Sunken / striped row background                                 |
| `--text-primary` | Default text                                                    |
| `--text-muted`   | Secondary text                                                  |
| `--text-faint`   | Captions, timestamps                                            |
| `--accent`       | Amber — primary CTAs, active tabs, focus rings                  |
| `--secondary`    | Slate-blue — links, hover affordance, drill-info color          |
| `--border`       | Cards, dividers                                                 |
| `--class-best`   | `!` classification glyph + bar                                  |
| `--class-good`   | (silent) classification baseline                                |
| `--class-inaccuracy` | `?!` classification                                          |
| `--class-mistake`| `?`                                                             |
| `--class-blunder`| `??`                                                            |
| `--class-book`   | `book` (Lichess masters DB)                                     |
| `--class-opening`| `opening` (early-ply fallback)                                  |
| `--board-light`  | Light square                                                    |
| `--board-dark`   | Dark square                                                     |
| `--board-highlight` | Last-move + check highlight                                  |

Themes light / dark / system swap the variables only — components are
oblivious. The audit script `scripts/check-flex.mjs` catches Tailwind
flex/grid utilities applied without a display class (a real bug a few
times during the build).

## 5. Feature surface

### 5.1 Analyze

- **Input** — paste a PGN, drop a `.pgn` file, or click-through the
  Library / starter games.
- **Engine eval** — Stockfish Lite (~6 MB, default) or Full (~40 MB,
  on-demand). Multi-PV pinned to 3. User-configurable depth 10–30.
- **Eval bar + graph** — bar in the board sidebar; graph beneath
  the move list. Click any point to jump to that ply.
- **Classification overlay** — `best · good · inaccuracy · mistake ·
  blunder · book · opening` per ply, surfaced as a glyph next to the
  SAN in the move list and as a chip in the move-detail card.
  Logic in `src/analysis/classify.ts`; see DEVELOPMENT.md for the
  win-probability formula + thresholds.
- **Guess-the-move** — toggle in the Analyze header; the next move
  is masked and the user is scored on accuracy. Stats persisted
  per game and overall in `guessRecords`.
- **Exploration** — the user can branch off the mainline to explore
  alternatives. The Elle context-aware chat is told when the user is
  in an off-mainline branch so its commentary acknowledges the
  detour.
- **Per-move commentary (Elle)** — clickable button on each move
  triggers a chat call with the move + position context. Cached
  per (FEN + UCI + provider + model) so re-clicking returns
  instantly.

### 5.2 Openings

- **Curated catalog** + paste-import of any Lichess study URL or
  8-char slug. Imported studies live in Dexie `studies` (raw PGN +
  pre-parsed chapter list).
- **Study viewer** — chapter list, move list with author comments,
  eval bar, captures display, opening tag (ECO + Explorer when
  enrichment is available).
- **Per-chapter drill (`DrillView` + `useDrill`)**
  - Mode: `board` (drag pieces) or `guess` (type SAN).
  - User picks their side per chapter (one drill row per side).
  - Status machine: `playing → wrong | feedback | complete`. The
    `feedback` state shows the author's chapter note after a correct
    move; user taps Next to advance.
  - Chat invalidation: opening the chat panel mid-drill prompts a
    confirmation modal — confirming flips `invalidated: true` on the
    attempt, and the line's cumulative stats are not bumped on
    completion. Per spec: "one-time per session per attempt."
- **Mixed / Spot drill (`MixedDrillView` + `useMixedDrill`)**
  - Pool indexer (chessops-driven) walks every chapter PGN and every
    variation, writing one row per unique normalised FEN to
    `drillPositions`. Each row carries all occurrences (chapter
    index + SAN/UCI + side-to-move + ply).
  - Mixed (free) mode: the user plays a side; the app picks a
    weighted-random opponent reply from the indexed continuations.
    When a position has no indexed continuation the engine
    teleports to a fresh chapter start so the drill keeps
    accumulating user moves toward the target length.
  - Spot mode: positions where exactly one user-side move exists in
    the scope at ply ≥ 3. The user is asked to find it.
  - Saved drill sessions (`drillSessions`) — the setup modal's
    "Add to queue" button stores any (study, scope, mode, side,
    length) combination so the practice queue can surface mixed /
    spot drills the same way it surfaces per-chapter drills.
- **Practice queue** — top of `/openings` when at least one drillable
  row exists. Renders interleaved `DrillLineRow` + `DrillSessionRow`
  with start / remove buttons. Lines are sorted by the scheduler
  (`failed → stale → review`); sessions surface most-recently-touched
  first.
- **Lichess Opening Explorer** — token-gated (Lichess required auth
  on Masters in 2026). Bundled ECO `src/data/eco.json` is the
  always-available opening-name source; Explorer adds master-game
  counts + popular-continuation lists + finer-grained opening tags
  when a token is configured.

### 5.3 Plan (Step 9)

Goal tracker + fixed weekly template + daily checklist. Spec is in
the prompt that landed this step; the canonical bullet points:

- **Goal entry** — free-text textarea. Optional natural-language
  target-date parser (`3 months`, `by Aug 15`) tucks an ISO date on
  the row when it can.
- **Editing replaces** the goal; old goals are archived (`archived:
  true`) for history but not shown unless the user opens
  `Previous goals (N)` — read-only.
- **Fixed weekly template** — Mon drill, Tue analyze, Wed drill, Thu
  analyze, Fri drill, Sat lesson, Sun guess review; daily Lichess
  puzzle prompt on every day. Tuned for repetition: drills cluster
  on Mon/Wed/Fri, analyses on Tue/Thu.
- **Rollover** — items uncompleted by today (this week) appear in
  today's section with a `from <Day>` annotation. The original
  day's column displays the item as `(moved to today)` so the
  same item never shows twice on screen.
- **Reset** — weekly checklist resets Monday at local midnight. The
  `usePlan` hook polls the local day every 5 minutes so a tab left
  open through midnight visibly resets without a full reload.
- **Summary** — `X / Y items completed this week` with no judgment
  copy.

### 5.4 Elle (chat panel)

- **Always-available** via a floating button (right edge on desktop,
  bottom-right on mobile).
- **Threads** — a single `general` thread + one per game keyed on
  PGN hash. Thread switch never strands the input behind a stale
  sending spinner.
- **Screen context** — a `ScreenContext` discriminated union is
  published by every screen (`game | idle | lesson | drill`).
  `buildSystemPrompt(screen)` composes the persona prompt with the
  current FEN, last move, expected moves (drills), study + chapter
  (lessons), and game label (analysis).
- **Web search** — per-message toggle (🔎). Off by default. Tools
  the user doesn't enable are not exposed to the model so it can't
  decide to search on its own.
- **Citations** — provider adapters filter URLs through
  `src/lib/safeUrl.ts` at ingest so only `http:` / `https:` URLs are
  ever stored. `ChatPanel` re-filters at render as defence in
  depth.
- **Per-move commentary** — separate from the chat thread; cached
  in `moveCommentaries` so the same (FEN + UCI + provider + model)
  returns instantly.

### Elle persona + safeguards

- **No fabrication.** Chess facts must be grounded in engine eval
  (`PositionEvalRow`), explorer stats (`ExplorerEntryRow`), or
  web-search citations. The persona prompt explicitly says to
  refuse / abstain rather than invent a citation.
- **No emojis in replies.** The 🔎 indicator next to "search ran" is
  rendered by the UI, not the model.
- **No personal advice** outside chess. The persona prompt scopes
  Elle to chess + KnightSchool — off-topic asks get a polite
  redirect.
- **Drill awareness.** When the screen context is `drill`, the
  prompt includes the current FEN, expected SAN moves with
  chapter provenance, and the invalidated flag. This lets Elle
  give context-aware help only after the user has acknowledged the
  invalidation warning.

## 6. Multi-key LLM system

Five providers ship today: Groq, Gemini, Anthropic, OpenAI,
OpenRouter. Two adapter patterns:

- **OpenAI-compatible** (Groq, OpenRouter) — base URL + model list
  through `createOpenAiCompatProvider`.
- **Custom protocol** (Anthropic Messages, OpenAI Responses, Gemini
  generateContent) — native client per provider.

Per provider the user can save multiple keys (work / personal / free
tier), pick an **active** key, and toggle **auto-fallback** (on by
default) so a rate-limit on the active key transparently retries
against the others. The `callChat` candidate list is: active first,
then any others if fallback is enabled.

### Session-only keys (Step 9 of the security pass)

The "Session only" checkbox on Add Key stores the key in an
in-memory Map only — never written to IndexedDB. Read paths
(`getApiKey`, `getKeysForProvider`, `getProviderConfig`) merge the
session store with the persistent store so session keys are
first-class across `useApiKeys`, `callChat`, and the chat panel.
Provider activation on a session key writes to a separate
`sessionProviderConfig` Map so we don't persist a dangling id to
Dexie.

### Storage disclosure

The Settings → Elle screen shows an amber banner explaining that
saved keys live unencrypted in this browser's IndexedDB. Pasting
organisation-level keys is discouraged; the session-only toggle is
the right answer for shared devices.

## 7. Offline support

- **App shell** is precached by the PWA service worker (`registerType:
  'prompt'`). After first load the app launches offline.
- **Stockfish WASM** is precached alongside the shell, so engine
  analysis works offline.
- **ECO opening database** is bundled (`src/data/eco.json`) — opening
  names work offline.
- **Explorer entries** are cached in Dexie + the SW runtime cache
  with a 30-day stale-while-revalidate window; previously-fetched
  positions render offline.
- **Studies** are forever-cached in Dexie; the viewer never refetches
  except via an explicit Refresh button.
- **Sounds** are synthesised live via Web Audio (no files to cache).
  **Board pieces** are SVG and ship in the JS bundle.
- **LLM calls** require network. The chat input + import / explain
  buttons surface "Network not available" tooltips when
  `navigator.onLine === false`.
- **Update prompt** — the SW dispatches an update banner when a new
  build is precached; user taps "Reload to update" to swap in.

## 8. Deployment

- **Cloudflare Pages** — push to `main` → auto-deploy. There is no
  GitHub Actions CI; Cloudflare's Vite build is enough for MVP
  (TS errors fail the build).
- **Headers** are served via `public/_headers`:
  - `Cross-Origin-Opener-Policy: same-origin` and
    `Cross-Origin-Embedder-Policy: require-corp` so Stockfish can use
    `SharedArrayBuffer` for multi-threaded eval.
  - `Content-Security-Policy` (strict, see security pass) blocks
    inline scripts, restricts `connect-src` to the five LLM provider
    endpoints + Lichess + self, and allows WASM eval only via
    `wasm-unsafe-eval`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy:
    strict-origin-when-cross-origin`, `Permissions-Policy:
    interest-cohort=()`.
- **Rollback** — Cloudflare dashboard → Deployments → pick a previous
  deploy → Rollback.
- **Preview deploys** — push any non-`main` branch; Cloudflare creates
  the preview URL automatically.

## 9. Self-hosting

```sh
git clone https://github.com/justagist/knight_school
cd knight_school
nvm use            # picks up .nvmrc → Node 20+
npm install
npm run dev        # http://localhost:5173 with COOP/COEP
```

Build + serve static:

```sh
npm run build
npm run serve      # serves dist/ at http://localhost:8080 with COOP/COEP
```

There are no environment variables. The user brings their own LLM API
key via the in-app Settings page.

## 10. Conventions

### Commits

Conventional Commits, enforced through `standard-version`. Subject
≤72 chars, imperative mood. Types: `feat fix refactor perf docs test
chore build ci style revert`. AI co-author trailers are NOT added.

### Code style

- TypeScript strict.
- Tailwind for styling; never hard-coded hex outside theme tokens.
- React functional components + hooks; no class components.
- No comments that restate code; comments explain *why*, never
  *what*.
- Don't add backwards-compat shims or "deprecated" markers when a
  rename is internal — just change the code.
- Don't add error handling for cases that can't happen. Trust
  internal call sites.

### Build steps

The MVP was built in ten numbered steps with an explicit
"continue" gate between each (memory:
`feedback_build_workflow.md`). Each step ships with `npm run check`
green and a pause-and-verify hand-off. Step 10 is the polish + v1.0.0
release; SPEC.md is part of it.

## 11. Open / deferred items

- `crypto.randomUUID` fallback in `src/lib/uuid.ts` is dev-only and
  removed after the phone-testing cycle. Tracked in
  `MEMORY/project_remove_uuid_fallback.md`.
- Spot-drill lead-up walk (replay the previous 2–4 moves before
  asking the user to find the critical move) — TODO breadcrumb in
  `src/drill/useMixedDrill.ts:initialState`.
- Plan target-date parser is intentionally narrow ("N units",
  "by Month Day"). Richer NL ("by end of year", "next quarter") can
  plug in at the `TODO(plan-date-parser)` breadcrumb in
  `src/plan/week.ts`.
- README screenshots ship in Step 10.
- v1.0.0 tag ships at the very end of Step 10.
