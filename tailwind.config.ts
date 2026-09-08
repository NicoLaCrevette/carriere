import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', '"Oswald"', 'Impact', 'sans-serif'],
        body: ['"Barlow"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Fonds et surfaces, du plus profond au plus clair.
        ink: {
          950: '#06080d',
          900: '#0b0e15',
          850: '#10141d',
          800: '#151a25',
          700: '#1d2431',
          600: '#28313f',
          500: '#3a4557',
          400: '#55617a',
        },
        // Accent unique : le vert citron des maillots et des applis de sport.
        accent: {
          DEFAULT: '#c9f24d',
          soft: '#e2ff9b',
          deep: '#93bb22',
        },
        // Couleurs de signal, réservées à l'information (score, alerte, blessure).
        signal: {
          red: '#ff5d70',
          green: '#3ddc84',
          blue: '#6ba4ff',
          amber: '#ffc25c',
        },
        muted: '#8d97a8',
      },
      borderRadius: {
        card: '1.5rem',
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 12px 32px -16px rgb(0 0 0 / 0.9)',
        glow: '0 0 0 1px rgb(201 242 77 / 0.35), 0 8px 28px -12px rgb(201 242 77 / 0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;
