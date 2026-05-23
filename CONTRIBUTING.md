# Contributing

Thanks for the interest. KnightSchool is a personal-use solo project, but contributions are welcome on forks.

## Workflow

1. Open an issue describing the change before sending a PR.
2. Branch from `main`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit:
   - `feat:` — new feature
   - `fix:` — bug fix
   - `docs:` — docs only
   - `refactor:` — code change without feature or fix
   - `chore:` — tooling / deps / build
   - `perf:` — performance
   - `test:` — tests
   - `BREAKING CHANGE:` — in commit body
4. Run `npm run check` before pushing — must pass with no errors.
5. Open a PR. CI is intentionally minimal: Cloudflare Pages will fail the deploy preview if the build breaks.

## What's in / out of scope

- ✅ Bug fixes, performance improvements, accessibility fixes.
- ✅ New LLM providers (see [DEVELOPMENT.md](./DEVELOPMENT.md)).
- ✅ Additional board / piece themes.
- ⚠️ New features — please discuss in an issue first; the app's scope is intentionally narrow.
- ❌ Telemetry, analytics, third-party tracking. Hard no.
- ❌ Server-side anything.

## Style

- TypeScript strict mode is on; keep it on.
- Prettier handles formatting (`npm run format`).
- ESLint defaults are relaxed by design — no aggressive rules. Don't add ones that fight iteration.
- Avoid emojis in code and content (Elle is emoji-free by spec).
