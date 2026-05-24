# Development

## Architecture overview

KnightSchool is a fully client-side React + TypeScript PWA. There is no backend.

- **UI** - React 18 + Vite + Tailwind CSS. Mobile-first responsive layout (side-by-side on desktop ≥1024px, stacked on mobile).
- **Routing** - `react-router-dom`. Six routes: Home (default), Analyze, Study (formerly `/openings`, still redirects), Plan, Settings, NotFound. Routes are `React.lazy()` split so the initial bundle doesn't drag analyze-only deps into Home.
- **Board** - `chessground` for rendering + `chess.js` for move generation & validation.
- **Engine** - Stockfish (WASM) running in a Web Worker. Multi-PV hardcoded to 3.
- **Storage** - IndexedDB via `Dexie.js`. Backup/restore via `dexie-export-import`.
- **LLM** - Thin `LLMProvider` interface. Five direct implementations: Anthropic, OpenAI, Gemini, Groq, OpenRouter (the last two via the shared OpenAI-compatible factory). Direct browser → provider calls, no proxy.
- **PWA** - `vite-plugin-pwa` with `registerType: 'prompt'`. Service worker precaches app shell + WASM + sounds + ECO data.

## Data sources

KnightSchool talks to three external surfaces. Everything else is local.

### Bundled ECO opening database

`src/data/eco.json` - a position-keyed map (FEN → `{ eco, name }`) produced by [`scripts/build-eco.mjs`](scripts/build-eco.mjs) from [`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings) (CC0). 3,704 named positions covering ECO A00–E99.

This is the **always-available** opening-name source. Works offline. No auth. The inline `[OPENING]` badge in the Analyze view reads from this first.

To rebuild after upstream updates:

```sh
# Fetch the latest TSVs
for f in a b c d e; do curl -sL "https://raw.githubusercontent.com/lichess-org/chess-openings/master/${f}.tsv" -o "/tmp/eco-${f}.tsv"; done
# Re-generate the JSON
node scripts/build-eco.mjs
# Commit the updated src/data/eco.json
```

The build script normalizes FENs to the 4-field form (position + side-to-move + castling + en-passant) so transpositions collapse. On conflict the longer (more specific) name wins.

### Lichess Opening Explorer (optional, token-gated)

`https://explorer.lichess.ovh/masters` - master-game stats per FEN (white/draws/black totals, top continuations, opening tags). **As of 2026 this endpoint requires authentication** - anon access returns 401. KnightSchool falls back to bundled ECO when no token is set.

When the user pastes a personal token (Settings → Lichess account), the Explorer is fetched in parallel during game-load and Analyze-game runs. Cached aggressively in two tiers:

- **Dexie** (`explorerEntries` table) - parsed totals + opening name + top continuations. 30-day stale-while-revalidate. Driven by `src/explorer/client.ts`.
- **Service Worker runtime cache** - raw HTTP responses, also 30-day SWR. Defined in `vite.config.ts` workbox runtime caching rules.

Token verification uses `https://lichess.org/api/account` (any valid token works - no scope required).

### Lichess Studies (Openings tab)

`https://lichess.org/api/study/{id}.pgn` returns the full multi-game PGN for a public study (one game per chapter). Anonymous reads work for public studies; the optional Lichess token from Settings is forwarded when present for higher rate limits and access to private studies the user has been added to.

The Openings tab is the consumer. Three import paths:

1. **Curated catalog** - hand-picked seed list in [src/lessons/catalog.ts](src/lessons/catalog.ts) (Italian Game, Ruy Lopez, Caro-Kann, etc.). Click a catalog card → fetch + parse + store in Dexie `studies` table → open the viewer.
2. **Paste-import** - user pastes a `lichess.org/study/...` URL or 8-char slug. Same fetch/parse/store path.
3. **Deep-link from Analyze** - opening name + each "Variations from here" row link to `/openings?name=<name>`. The Openings page resolves the name against `CURATED_STUDIES[].matches` and auto-imports the match (or shows a friendly "no curated study matches X" banner so the user can paste their own).

Studies are cached forever in Dexie. The viewer has an explicit **Refresh** button that re-fetches and overwrites - no automatic SWR. Studies are user-curated content, not API lookups; we don't want silent background changes.

Parser ([src/lessons/lichessStudy.ts](src/lessons/lichessStudy.ts)) splits Lichess's multi-game PGN on the boundary `\n\n[Event` (blank line followed by a new game's Event tag) and pulls each chapter's title from the `[ChapterName "..."]` tag (a Lichess-specific tag). Falls back to `Chapter N` when the tag is missing.

### Why hybrid (ECO + token-gated Explorer)?

Originally Explorer was public; we used it as the single source of truth for opening names + book classification. Lichess shipped an auth requirement in 2026 and the entire flow broke (401 on every call). Options were:

1. Require every user to make a token → bad first-run UX.
2. Proxy through a Cloudflare Worker → breaks the "no backend" spec rule.
3. Bundle ECO data + make Explorer optional. **Chosen.**

Bundled ECO is enough for the inline opening name on most positions. Explorer adds master-game counts, popular-continuation lists, and finer-grained opening tags. Step 8B's Openings tab degrades gracefully without a token but lights up with one.

## Move classification logic

KnightSchool classifies each played move as one of:
`opening · book · best · good · inaccuracy · mistake · blunder`.

Logic lives in `src/analysis/classify.ts`. The summary:

### Win-probability conversion (Lichess formula)

Raw centipawn-loss thresholds are unusable in the opening - a 50 cp shift in a balanced position barely changes real outcomes, but a CP-loss classifier would still flag it as an "inaccuracy." We use Lichess's win-probability conversion instead, which is roughly linear in expected game outcome:

```ts
winChance = 50 + 50 * (2 / (1 + Math.exp(-0.00368 * cp)) - 1)
```

`cp` is in centipawns from the moving side's perspective. The output is a percentage in `[0, 100]`. Calibration: ~+100 cp ≈ 59% win chance, ~+300 cp ≈ 76%, matching empirical game outcomes from the Lichess database.

For mate scores we substitute ±10000 cp before the sigmoid (effectively saturating it).

### Thresholds (on drop in mover's win-probability, before → after)

| Drop                            | Class        | Glyph    |
|---------------------------------|--------------|----------|
| ≥ 20%                           | `blunder`    | `??`     |
| ≥ 10%                           | `mistake`    | `?`      |
| ≥ 5%                            | `inaccuracy` | `?!`     |
| < 5%, mover played engine's #1  | `best`       | `!`      |
| < 5%, otherwise                 | `good`       | (silent) |

`good` deliberately has no glyph - Lichess UX keeps the move list visually quiet on routine moves. The classification still exists for downstream stats.

### Guards (the "don't classify" cases)

1. **Depth guard.** If either cached eval row is shallower than `MIN_CLASSIFY_DEPTH` (16), return `null`. Eval below depth 16 isn't reliable enough to call a move a mistake. The UI surfaces a "depth too low for classification" note when the user's analysis depth setting is below this threshold.

2. **Opening fallback (`'opening'`).** For the first `OPENING_PLY_THRESHOLD` plies (currently 12 - moves 1–6 of every game), return `'opening'` regardless of engine eval. This is a deliberate placeholder until Step 7 ships Lichess Opening Explorer integration. Engine eval in mainline opening play tells you nothing about whether a move was actually a mistake - opening theory exists precisely because shallow eval is misleading there.

3. **Book classification (`'book'`) - reserved for Step 7.** Will fire when a position appears in the Lichess masters database with at least 1000 master games. Until Step 7 lands the Explorer client, the `'book'` classification type is defined but never emitted by `classifyFromCachedRows`. The UI styling is in place so the Step 7 PR is purely backend.

4. **Terminal positions (checkmate / stalemate / draw)** carry `depth: 0` synthetic rows. The depth guard explicitly allows these through - their evaluation is definitive, not shallow.

### Why not just count cp loss?

We tried it. The first version of the classifier used CP-loss thresholds (≥300 → blunder, ≥100 → mistake, ≥50 → inaccuracy) and labeled basically every move in the opening - including `1.e4 e5 2.Nf3` book moves - as `inaccuracy` or `good`. Win probability is non-linear in cp at the extremes, which is exactly the regime where small CP swings don't matter to the outcome.

### Future work

- **Step 7** will replace the moves-1-to-6 fallback with real "is this position in the Lichess masters DB?" lookup via the Opening Explorer API. The `'book'` classification slot is already defined and styled.
- Brilliant moves (`!!`) and Great moves are out of scope for MVP.
- Engine-eval-based "Great" detection (move improves position against multiple alternatives) - possible future addition.

## Tech stack rationale

- **Vite** over Webpack - faster HMR, simpler config, first-class TS.
- **Tailwind** over CSS modules / styled-components - easiest path to a consistent visual language without a design system.
- **chessground + chess.js** over a hand-rolled board - these are the libraries Lichess itself uses; reinventing them is a waste.
- **Dexie** over raw IndexedDB - much friendlier API; export/import comes free.

## Local dev setup

```sh
# Node 20 or newer is required (package.json `engines.node`). An .nvmrc
# pins to 22 - if you use nvm, `nvm use` picks it up. On Node 18 the
# postinstall step + the chessops imports will fail with cryptic
# top-level-await / native-fetch errors.
nvm use            # picks up .nvmrc
npm install        # postinstall copies Stockfish into public/engine/
npm run dev        # http://localhost:5173 with COOP/COEP headers preset
```

### Smoke test (after a fresh clone)

```sh
git clone https://github.com/justagist/knight_school /tmp/ks-smoke
cd /tmp/ks-smoke
nvm use
npm install            # ~2s; ~750 packages; postinstall logs three
                       # `[copy-engine] …` lines
npm run build          # ✓ built in ~3s; PWA precache 22 entries
npm run serve          # serves dist/ on :8080 with COOP/COEP/CORP/
                       # X-Content-Type-Options. Open in a browser
                       # with DevTools Network tab and confirm
                       # `Cross-Origin-Opener-Policy: same-origin` on
                       # the index.html response - required for
                       # multi-threaded Stockfish.
```

`npm run dev` and `npm run serve` set the COOP/COEP/CORP headers
Stockfish needs. They do **not** set the strict CSP from
`public/_headers` - that's Cloudflare-Pages-only. If you need to
test CSP locally, run `npx wrangler pages dev dist/` instead of
`npm run serve`.

## Project structure

```text
knight_school/
├── public/              # static assets, _headers, _redirects, PWA icons,
│                        #   /engine/* Stockfish workers, /theme-init.js
├── scripts/
│   ├── serve.js         # local static server with COOP/COEP for dist/
│   ├── build-icons.mjs  # raster icon-512.svg → 180/192/512 PNGs
│   ├── build-eco.mjs    # rebuilds src/data/eco.json from lichess-org/chess-openings
│   ├── check-flex.mjs   # audit Tailwind flex/grid utilities without a display class
│   └── copy-engine.js   # postinstall: copies Stockfish from node_modules
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── analyze/         # AnalyzeView + game state + classification overlay
│   ├── analysis/        # full-game analysis pipeline + classifier
│   ├── chat/            # ChatHost, ChatPanel, useChat, ChatContextProvider
│   ├── components/      # shared UI (Board, Header, BottomTabBar, EvalBar, OfflineBanner, ...)
│   ├── data/            # bundled ECO opening database
│   ├── db/              # Dexie schema + per-table CRUD facades
│   ├── drill/           # per-chapter + mixed/spot drill state machines
│   ├── engine/          # Stockfish handle + UCI state machine
│   ├── explorer/        # Lichess Masters DB client
│   ├── guess/           # guess-the-move state + persistence
│   ├── lessons/         # Lichess Study import + viewer
│   ├── lib/             # shared helpers (pgn, moveToUci, safeUrl, uuid)
│   ├── llm/             # provider adapters + chat call + session key store
│   ├── pages/           # one component per route + per-section settings panels
│   ├── plan/            # Step 9 goals + weekly template + week helpers
│   ├── settings/        # SettingsProvider + theme tokens
│   ├── sounds/          # move/capture/check/game-end audio
│   ├── styles/          # global Tailwind entry + board.css
│   └── theme/           # ThemeProvider (light/dark/system)
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── SPEC.md              # canonical product + architecture spec
└── DEVELOPMENT.md
```

## Build / test / release workflow

```sh
npm run check         # tsc --noEmit + eslint
npm run build         # tsc + vite build → dist/
npm run serve         # serves dist/ with COOP/COEP headers
npm run release       # standard-version: bumps version + updates CHANGELOG + tags
```

Push to `main` → Cloudflare Pages auto-deploys. There is no GitHub Actions CI - Cloudflare fails the build on TS errors, that's enough for MVP.

## Conventional Commits

Required (enforced by `standard-version` consuming the log).

- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - docs only
- `refactor:` - code change that doesn't add a feature or fix a bug
- `chore:` - tooling / deps / build
- `perf:` - performance
- `test:` - tests
- `BREAKING CHANGE:` - in commit body, bumps major

## Release flow

```sh
npm run release             # bumps version + CHANGELOG + creates git tag
git push --follow-tags      # pushes commits + tag → auto-deploy
```

## Adding a new LLM provider

Five providers ship today: Groq, Gemini, Anthropic, OpenAI, OpenRouter. Two patterns:

**OpenAI-compatible (`/v1/chat/completions`)** - Groq, OpenRouter, and most aggregators. The reusable factory at [src/llm/providers/openaiCompat.ts](src/llm/providers/openaiCompat.ts) handles the request/response shape; a new provider is usually just a base URL + model list:

```ts
// src/llm/providers/mything.ts
export const mythingProvider = createOpenAiCompatProvider({
  id: 'mything',
  displayName: 'MyThing',
  baseURL: 'https://api.mything.example/v1',
  models: [{ id: 'mything-pro', label: 'MyThing Pro', webSearch: false, default: true }],
});
```

**Custom protocol** - Anthropic (Messages API), OpenAI (Responses API), Gemini (generateContent). Native client per provider under `src/llm/providers/<name>.ts` implementing the full `LLMProvider` interface.

Steps for either pattern:

1. Add a file under `src/llm/providers/yourProvider.ts`. Export both `<name>Provider: LLMProvider` and `<name>Info: ProviderInfo`.
2. Add the id to `LlmProviderId` in [src/db/db.ts](src/db/db.ts).
3. Register in [src/llm/providers/index.ts](src/llm/providers/index.ts) - both `PROVIDERS` (controls dropdown order) and the `*_BY_ID` records.
4. Add the masked-key prefix in `maskedExample()` in [src/pages/settings/LlmSection.tsx](src/pages/settings/LlmSection.tsx).
5. Set `supportsWebSearch: true` only if the provider exposes a built-in web-search / grounding tool. The chat UI's 🔎 toggle is hidden on providers where this is false.

### Web search capability matrix

| Provider   | Web search | Notes                                                                       |
|------------|------------|-----------------------------------------------------------------------------|
| Anthropic  | ✓          | `web_search_20250305` tool, small per-search fee                            |
| OpenAI     | ✓          | Responses API `web_search` tool                                             |
| Gemini     | ✓          | `googleSearch` grounding tool                                               |
| Groq       | ✗          | No web-search surface in the compat API                                     |
| OpenRouter | ✗          | Routes to many models, but no exposed search tool through chat.completions  |

When `supportsWebSearch` is false, the chat panel renders the disabled label (`Web search unavailable on <providerName>`) in place of the 🔎 toggle, and the chat call forces `enableWebSearch: false` as defence in depth.

## Adding a curated opening

The Openings page seeds the catalog from [src/lessons/catalog.ts](src/lessons/catalog.ts). The shipped list is the top of `lichess.org/study/all/popular` filtered to studies that fetch publicly (HTTP 200 on `/api/study/{id}.pgn`).

To add or refresh entries:

```sh
# pull the current popular list
curl -s https://lichess.org/study/all/popular | grep -oE 'href="/study/[A-Za-z0-9]{8}"' | sort -u

# verify each slug is publicly fetchable
for id in <slug1> <slug2>; do
  curl -sS -o /dev/null -w "$id: %{http_code}\n" "https://lichess.org/api/study/${id}.pgn"
done
```

Append a `CuratedStudy` row per verified slug - fill in `author`, `blurb`, `category` (`fundamentals` / `openings-white` / `openings-black` / `endgames`), and `matches` aliases that should match the opening name when the Analyze view links here.

### Search + deep-link

The search bar at the top of `/openings` filters the catalog + library client-side (substring match on name, author, blurb, aliases). The Analyze view's opening name + "Variations from here" rows link to `/openings?search=<encoded-opening-name>` which pre-fills the search box. An external "Search on Lichess ↗" link sits next to the bar as the fallback for openings outside the catalog.

> There is **no public JSON search API for Lichess studies** - `lichess.org/study/search?q=…` serves HTML only and the route is not on Lichess's CORS allowlist. The bundled catalog plus the external-search link is the no-backend compromise.

## Drill mode

The lesson viewer has a `▶ Drill this chapter` button that quizzes the user on a chapter's main line. App plays the opponent moves; user plays their side. Pass / fail recorded per `(study, chapter, userSide)` row in Dexie's `drillLines` table (v8).

Each chapter can produce two drill lines (one per colour). User picks the side on first drill - the picker is inline in the viewer header.

### Variants

- **Board** (default) - drag pieces; `Board` component is interactive with `movableColor` pinned to the user's side.
- **Guess (SAN)** - board is read-only, user types the move in algebraic notation. Toggle in the drill header.

### Scheduler

Priority queue in [src/drill/scheduler.ts](src/drill/scheduler.ts):

1. **Failed** - `lastResult === 'fail'`.
2. **Stale** - never drilled OR `lastDrilledAt` more than 7 days ago.
3. **Review** - recently passed.

Within each bucket, oldest first. Surfaced as a `Practice queue` section on the Openings page when at least one line exists.

### Chat invalidation

Spec requires: opening chat mid-drill invalidates the attempt. Implementation:

- [src/drill/DrillContext.tsx](src/drill/DrillContext.tsx) tracks `active` (any drill mounted) + an `invalidator` callback DrillView registers on mount.
- `ChatHost.setOpen(true)` checks the drill context; if active + warning not yet acknowledged this attempt, shows a confirmation modal: *"Open chat during drill?"* with `Cancel` / `Continue and invalidate`.
- Continue → calls the registered invalidator (sets `state.invalidated = true` on the drill) + opens the panel. Subsequent chat-opens during the same attempt skip the modal (`warningAcknowledged` flag).
- Invalidated attempts get logged to `drillAttempts` but **do not** update the line's cumulative `attempts` / `successes` counters or `lastResult` - they're invisible to the scheduler.
- Retrying a drill resets the warning flag so a new attempt re-prompts.

## Deployment

- **Auto-deploy** - push to `main`.
- **Build status** - Cloudflare Pages dashboard → Project → Deployments.
- **Logs** - click any deployment in the dashboard.

## Rollback

Cloudflare dashboard → Deployments → pick a previous deployment → **Rollback to this deployment**.

## Preview deploys

Push to any non-`main` branch. Cloudflare creates a preview URL automatically.

## Emergency manual deploy

```sh
npm run build
npx wrangler pages deploy dist
```

## Troubleshooting

- **Stockfish won't start / `SharedArrayBuffer is not defined`** - COOP/COEP headers are missing. Verify in browser DevTools → Network → response headers. Local dev: should be set by Vite config. Cloudflare: `public/_headers`. Self-hosting: `npm run serve` sets them.
- **PWA update not appearing** - Service worker is fetching in background; reload the tab and the "Update available" banner should appear. Hard-reset via DevTools → Application → Service Workers → Unregister.
- **iOS clears IndexedDB after ~7 days of inactivity** - Known Safari behavior. Encourage users to "Add to Home Screen" - installed PWAs are exempt.
- **Tailwind classes not applying** - Check `tailwind.config.js` `content` globs include the file you're editing.

## Contributing

If you fork: open an issue first describing the change. Conventional Commits required. Run `npm run check` before pushing.
