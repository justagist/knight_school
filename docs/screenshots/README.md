# Screenshot brief

These are the screenshots referenced in the root `README.md`. Drop the
PNGs into this directory using the exact filenames below and the README
will pick them up.

## Capture spec

- **Browser** — recent Chrome / Edge / Brave. Safari is fine too; avoid
  Firefox's window-frame chrome for visual consistency.
- **Viewport** — capture from a 1280 × 800 desktop window. Use the
  browser's "Capture full size" or take a tight crop from a standard
  screenshot tool. PWA-style chrome (no toolbar) is acceptable if
  installed.
- **Mobile shots** — capture at 390 × 844 (iPhone 14 Pro) from
  DevTools' device mode OR a real device.
- **File format** — PNG. Run each through `oxipng` or `pngcrush`
  before committing — target **< 200 KB each** so the README stays
  cheap to clone.
- **Light + dark pair** — capture both for the landing, analyze, and
  chat shots. The other shots can be either; pick whichever reads
  cleaner against the page text.
- **Privacy** — make sure no real API key or Lichess token is visible
  in the Settings shot. Blur or use a test placeholder.

## Required files

| filename                            | viewport      | what to show                                                            |
|-------------------------------------|---------------|--------------------------------------------------------------------------|
| `landing-light.png`                 | 1280 × 800    | Home page; light theme; "Get started" CTA visible                       |
| `landing-dark.png`                  | 1280 × 800    | Home page; dark theme                                                    |
| `analyze-light.png`                 | 1280 × 800    | Analyze view with a real game loaded; classification chips ≥ 3 visible  |
| `analyze-dark.png`                  | 1280 × 800    | Same game, dark theme; eval graph in shot                               |
| `openings.png`                      | 1280 × 800    | Study tab with at least one imported study + the Practice queue visible |
| `chat-light.png`                    | 1280 × 800    | Elle chat panel open on the Analyze view; one example exchange visible  |
| `chat-dark.png`                     | 1280 × 800    | Same as chat-light, dark theme                                          |
| `plan.png`                          | 1280 × 800    | Plan tab with a goal set + today's column highlighted                   |
| `settings.png`                      | 1280 × 800    | Settings → Elle (LLM) section; the disclosure banner visible            |
| `mobile-analyze.png`                | 390 × 844     | Optional — mobile portrait of Analyze with the BottomTabBar              |

## After capture

1. Drop the files in this directory.
2. Open the rendered README on GitHub (web UI is the canonical
   render — VS Code preview is close enough but not identical).
3. Verify every image loads and isn't visibly squished.
4. Commit with `docs: add MVP screenshots`.
