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

## API keys

All credentials are stored locally in your browser. Nothing leaves your device except the actual provider calls.

### LLM (Elle)

Elle uses your provider's built-in web search tool for current chess news.

- **Anthropic** — Web search works on most current Claude models. Paid API account required, small per-search fee.
- **OpenAI** — Requires a model that supports web search. Small per-search fee.
- **Google Gemini** — Free tier available, paid for higher quotas.

If your plan or model doesn't support web search, Elle will still answer chess questions from training knowledge but won't have current news. Multi-key support means you can stack a free-tier Gemini key as the daily driver and fall back to a paid Anthropic / OpenAI key when you hit rate limits.

### Lichess (optional)

A Lichess personal access token unlocks the **Opening Explorer** (master-game stats, popular continuations, finer opening tags) and **Study import** features. Without a token the app still works — opening names come from the bundled ECO database (3,700+ positions), and the Openings tab still imports PGN you paste in.

To enable:

1. Sign in at [lichess.org](https://lichess.org/) and visit [account/oauth/token/create](https://lichess.org/account/oauth/token/create).
2. No scopes are required for the Explorer; leave them blank.
3. Copy the generated token.
4. In KnightSchool: **Settings → Lichess account → Add Lichess token**. Paste, save. The Settings UI validates the token immediately via `/api/account`.

The token is stored alongside your other data in IndexedDB. Exporting your backup with "Include API keys" enabled brings it along; without that toggle, it stays on the originating device.

> Lichess introduced auth on the Opening Explorer endpoint in 2026. The hybrid (bundled ECO + optional token) keeps the app fully usable for users who haven't created one.

## Deployment

Push to `main` → Cloudflare Pages auto-builds and deploys.

- Build command: `npm run build`
- Output directory: `dist`
- Framework preset: none

## License

MIT — see [LICENSE](./LICENSE).
