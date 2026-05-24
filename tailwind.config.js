/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Token-backed palette. Every entry resolves to a CSS variable defined
      // in src/styles/index.css. Components should reference these (e.g.
      // `bg-surface-1`, `text-muted`, `text-best`) instead of raw hex.
      //
      // The legacy `ink-*` and `accent` scales are kept for now because the
      // codebase has many sites still using them. New code MUST use the
      // tokens; older sites get migrated incrementally.
      colors: {
        // Surfaces
        base: 'var(--bg-base)',
        'surface-1': 'var(--bg-surface-1)',
        'surface-2': 'var(--bg-surface-2)',
        border: 'var(--border)',

        // Text
        primary: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',

        // Accent (amber - reserved for primary CTA / FAB / active toggle / logo)
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
        },

        // Secondary (slate blue - user chat bubble, secondary buttons)
        secondary: {
          DEFAULT: 'var(--secondary)',
          hover: 'var(--secondary-hover)',
          soft: 'var(--secondary-soft)',
        },

        // Move classifications - distinct hue per class so the move list
        // reads at a glance without leaning on the amber accent.
        best: 'var(--class-best)',
        good: 'var(--class-good)',
        inaccuracy: 'var(--class-inaccuracy)',
        mistake: 'var(--class-mistake)',
        blunder: 'var(--class-blunder)',
        book: 'var(--class-book)',

        // Board (used by board.css overrides + theme picker)
        'board-light': 'var(--board-light)',
        'board-dark': 'var(--board-dark)',
        'board-coord': 'var(--board-coord)',

        // Legacy ink-* scale. Kept temporarily so old sites compile. Migrate
        // away over time - prefer the token names above for new code.
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
