import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ground: 'var(--ground)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        ink: 'var(--text)',
        dim: 'var(--text-dim)',
        mute: 'var(--text-mute)',
        volt: 'var(--volt)',
        amber: 'var(--amber)',
        danger: 'var(--red)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: { arena: '2px' },
      transitionTimingFunction: { arena: 'cubic-bezier(0.2, 0, 0, 1)' },
    },
  },
  plugins: [],
}

export default config

