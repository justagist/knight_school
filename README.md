# KnightSchool

**Chess made easy.**

A client-side chess learning PWA. Analyze your own games with Stockfish, drill openings from real Lichess data, chat with **Elle** (an AI chess assistant), and follow a weekly practice plan toward a goal.

Everything runs in your browser — no backend, no auth, no telemetry. Bring your own LLM API key.

> **Status:** in active development. Currently on **Step 1 of 10** in the build plan — scaffold, branding, theme, PWA shell, and deploy pipeline.

## What it does

- **Analyze** — Paste a PGN; get move-by-move Stockfish evaluation, top engine lines, classification (best/good/inaccuracy/mistake/blunder), and an eval graph.
- **Elle** — A friendly AI chess assistant. Comments on moves on demand, answers chess questions, and uses your provider's web search for current news.
- **Openings** — Import Lichess Studies and drill repertoire lines. Pulls real stats from the Lichess Opening Explorer.
- **Plan** — Set a goal in plain text; get a fixed weekly template of drills, analysis, and lessons.

## Privacy

Everything runs in your browser. Your games, your API key, your chat history — all stored locally in IndexedDB. The only external calls are to:

- Stockfish (local WASM, no network)
- Lichess APIs (`lichess.org`, `explorer.lichess.ovh`) for studies and explorer stats
- Your chosen LLM provider (Anthropic or OpenAI) for Elle

No analytics, no telemetry, no third-party tracking.

## Self-hosting

Requires **Node 20 or newer** (an `.nvmrc` is included — `nvm use` picks it up).

```sh
git clone https://github.com/justagist/knight_school
cd knight_school
npm install
npm run dev        # local dev at http://localhost:5173
```

Build and serve a static copy:

```sh
npm run build
npm run serve      # serves dist/ at http://localhost:8080 with COOP/COEP
```

No environment variables. No `.env` file. Bring your own LLM API key in the in-app Settings page.

## Settings overview

- **Appearance** — Light / dark / system theme. Board theme and piece options (step 2+).
- **Engine** — Stockfish Lite (~6 MB, default) or Full (~40 MB, downloaded on demand). Analysis depth 10–30.
- **Sounds** — Move / capture / check / game-end. Off by default.
- **LLM (Elle)** — Provider (Anthropic / OpenAI), API key, model, test-connection button.
- **Storage** — Used MB, export/import all data, clear everything.

## LLM API key & news access

Elle uses your provider's built-in web search tool for current chess news.

- **Anthropic** — Web search works on most current Claude models. Paid API account required, small per-search fee.
- **OpenAI** — Requires a model that supports web search. Small per-search fee.

If your plan or model doesn't support web search, Elle will still answer chess questions from training knowledge but won't have current news.

## Deployment

Push to `main` → Cloudflare Pages auto-builds and deploys.

- Build command: `npm run build`
- Output directory: `dist`
- Framework preset: none

## License

MIT — see [LICENSE](./LICENSE).
