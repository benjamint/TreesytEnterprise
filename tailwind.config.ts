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
        // Desktop windows show the phone app inside a device frame, scaled to fit (PRD 4.2).
        frame: { raw: '(min-width: 768px)' },
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
        'line-strong': token('line-strong'),
        subtle: token('subtle'),
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
        base: ['var(--text-base)', 'var(--leading-base)'],
        eyebrow: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      // Control sizes and radii are variables: the web app is compact, the phone app keeps
      // its large tap targets (PRD 9: 56 px inputs, 52 px buttons) via `.mobile-ui`.
      height: { ctl: 'var(--ctl-sm)', 'ctl-lg': 'var(--ctl)', btn: 'var(--btn)', 'btn-sm': 'var(--btn-sm)', 'btn-xs': 'var(--btn-xs)', 'btn-lg': 'var(--btn-lg)' },
      width: { btn: 'var(--btn)', 'btn-sm': 'var(--btn-sm)' },
      borderRadius: { chip: 'var(--r-chip)', ctl: 'var(--r-ctl)', card: 'var(--r-card)', panel: 'var(--r-panel)' },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / .05)',
        xs: '0 1px 1px rgb(var(--shadow) / .06)',
        raised: '0 0 0 1px rgb(var(--shadow) / .03), 0 2px 6px -1px rgb(var(--shadow) / .08)',
        pop: '0 0 0 1px rgb(var(--shadow) / .04), 0 6px 12px -4px rgb(var(--shadow) / .08), 0 28px 56px -16px rgb(var(--shadow) / .28)',
        lift: '0 0 0 1px rgb(var(--shadow) / .04), 0 6px 12px -4px rgb(var(--shadow) / .08), 0 28px 56px -16px rgb(var(--shadow) / .28)',
        inner: 'inset 0 1px 0 rgb(255 255 255 / .14), 0 1px 2px rgb(var(--shadow) / .18)',
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
