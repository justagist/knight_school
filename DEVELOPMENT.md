# Development

## Architecture overview

KnightSchool is a fully client-side React + TypeScript PWA. There is no backend.

- **UI** — React 18 + Vite + Tailwind CSS. Mobile-first responsive layout (side-by-side on desktop ≥1024px, stacked on mobile).
- **Routing** — `react-router-dom`. Four pages: Analyze (default), Openings, Plan, Settings.
- **Board** — `chessground` for rendering + `chess.js` for move generation & validation.
- **Engine** — Stockfish (WASM) running in a Web Worker. Multi-PV hardcoded to 3.
- **Storage** — IndexedDB via `Dexie.js`. Backup/restore via `dexie-export-import`.
- **LLM** — Thin `LLMProvider` interface. Anthropic + OpenAI implementations. Direct browser → provider calls.
- **PWA** — `vite-plugin-pwa` with `registerType: 'prompt'`. Service worker precaches app shell + WASM + sounds + ECO data.

## Tech stack rationale

- **Vite** over Webpack — faster HMR, simpler config, first-class TS.
- **Tailwind** over CSS modules / styled-components — easiest path to a consistent visual language without a design system.
- **chessground + chess.js** over a hand-rolled board — these are the libraries Lichess itself uses; reinventing them is a waste.
- **Dexie** over raw IndexedDB — much friendlier API; export/import comes free.

## Local dev setup

```sh
npm install
npm run dev       # http://localhost:5173 with COOP/COEP headers preset
```

## Project structure

```
knight_school/
├── public/              # static assets, _headers, _redirects, PWA icons
├── scripts/serve.js     # local static server with COOP/COEP for testing dist/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/      # shared UI (Header, Footer, UpdatePrompt, ...)
│   ├── pages/           # one component per route
│   ├── theme/           # ThemeProvider (light/dark/system)
│   └── styles/          # global Tailwind entry + tokens
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

More directories arrive as later build steps land (`engine/`, `analysis/`, `llm/`, `db/`, `openings/`, `plan/`, `chat/`).

## Build / test / release workflow

```sh
npm run check         # tsc --noEmit + eslint
npm run build         # tsc + vite build → dist/
npm run serve         # serves dist/ with COOP/COEP headers
npm run release       # standard-version: bumps version + updates CHANGELOG + tags
```

Push to `main` → Cloudflare Pages auto-deploys. There is no GitHub Actions CI — Cloudflare fails the build on TS errors, that's enough for MVP.

## Conventional Commits

Required (enforced by `standard-version` consuming the log).

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — docs only
- `refactor:` — code change that doesn't add a feature or fix a bug
- `chore:` — tooling / deps / build
- `perf:` — performance
- `test:` — tests
- `BREAKING CHANGE:` — in commit body, bumps major

## Release flow

```sh
npm run release             # bumps version + CHANGELOG + creates git tag
git push --follow-tags      # pushes commits + tag → auto-deploy
```

## Adding a new LLM provider

1. Add a file under `src/llm/providers/yourProvider.ts` that implements `LLMProvider`.
2. Register it in the provider registry (`src/llm/providers/index.ts`).
3. Add a model dropdown entry in Settings.
4. If the provider has a different web-search tool shape, return appropriate `usedWebSearch` flag.

## Adding a curated opening

The Openings page shows 4–6 hand-picked Lichess Study URLs on first run. Edit `src/openings/curated.ts` and add `{ name, url, description, level }`. No content is bundled — only the URL.

## Deployment

- **Auto-deploy** — push to `main`.
- **Build status** — Cloudflare Pages dashboard → Project → Deployments.
- **Logs** — click any deployment in the dashboard.

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

- **Stockfish won't start / `SharedArrayBuffer is not defined`** — COOP/COEP headers are missing. Verify in browser DevTools → Network → response headers. Local dev: should be set by Vite config. Cloudflare: `public/_headers`. Self-hosting: `npm run serve` sets them.
- **PWA update not appearing** — Service worker is fetching in background; reload the tab and the "Update available" banner should appear. Hard-reset via DevTools → Application → Service Workers → Unregister.
- **iOS clears IndexedDB after ~7 days of inactivity** — Known Safari behavior. Encourage users to "Add to Home Screen" — installed PWAs are exempt.
- **Tailwind classes not applying** — Check `tailwind.config.js` `content` globs include the file you're editing.

## Contributing

If you fork: open an issue first describing the change. Conventional Commits required. Run `npm run check` before pushing.
