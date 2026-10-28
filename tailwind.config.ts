import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      screens: {
        // Desktop windows tall enough for the 390×844 device frame (PRD 4.2).
        frame: { raw: '(min-width: 768px) and (min-height: 900px)' },
      },
      colors: {
        brand: { DEFAULT: token('brand'), hover: token('brand-hover'), soft: token('brand-soft') },
        'on-brand': token('on-brand'),
        lime: token('lime'),
        'badge-dark': token('badge-dark'),
        ink: token('ink'),
        body: token('body'),
        muted: token('muted'),
        label: token('label'),
        surface: token('surface'),
        canvas: token('canvas'),
        line: token('line'),
        info: token('info'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        teal: token('teal'),
        unknown: token('unknown'),
        // shadcn aliases
        background: token('canvas'),
        foreground: token('ink'),
        border: token('line'),
        input: token('line'),
        ring: token('brand'),
        primary: { DEFAULT: token('brand'), foreground: token('on-brand') },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        base: ['15px', '24px'],
        eyebrow: ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      borderRadius: { chip: '8px', ctl: '12px', card: '16px', panel: '24px' },
      boxShadow: {
        soft: '0 1px 2px rgba(15,42,32,.04), 0 8px 24px rgba(15,42,32,.06)',
        inner: 'inset 0 1px 0 rgba(255,255,255,.18)',
      },
      backgroundImage: { ai: 'linear-gradient(90deg, #14583F, #B8E05A)' },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { rise: 'rise 150ms ease-out' },
    },
  },
  plugins: [animate],
} satisfies Config;
