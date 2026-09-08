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
        pitch: {
          950: '#05080b',
          900: '#0b1016',
          800: '#121a22',
          700: '#1b2530',
          600: '#25323f',
          500: '#33434f',
        },
        broadcast: {
          yellow: '#f5c518',
          red: '#e0263a',
          green: '#20c05a',
          blue: '#2f7cf6',
          grey: '#9aa7b2',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
