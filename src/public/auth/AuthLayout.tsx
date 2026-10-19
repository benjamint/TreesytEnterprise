import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Illustration } from '@/components/shared/Illustration';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { DemoDock } from '@/components/shared/DemoDock';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';
import type { Lang } from '@/types';

const SLIDES = ['auth.slide1', 'auth.slide2', 'auth.slide3'];

/** Glass card carousel over the illustration (PRD 6.1a): 3 slides, auto-advance 6 s, clickable dots. */
export function GlassCarousel({ className }: { className?: string }) {
  const [slide, setSlide] = useState(0);
  const { t } = useT();
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 6000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={cn('glass rounded-panel p-10', className)}>
      <p className="min-h-[84px] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink xl:text-[32px]" aria-live="polite">{t(SLIDES[slide]!)}</p>
      <div className="mt-6 flex items-center gap-2" role="tablist" aria-label={t('auth.slides')}>
        {SLIDES.map((k, i) => (
          <button key={k} type="button" role="tab" aria-selected={slide === i} aria-label={t(k)} onClick={() => setSlide(i)} className={cn('h-2 rounded-full transition-all duration-200', slide === i ? 'w-8 bg-brand' : 'w-2 bg-ink/25')} />
        ))}
      </div>
    </div>
  );
}

export function LanguageToggle() {
  const { language, setLanguage } = useSessionStore();
  const langs: Lang[] = ['en', 'fr'];
  const { t } = useT();
  return (
    <div className="flex items-center rounded-ctl border border-line p-0.5" role="group" aria-label={t('shell.language')}>
      {langs.map((l) => (
        <button key={l} type="button" onClick={() => setLanguage(l)} aria-pressed={language === l} className={`h-7 rounded-chip px-2 text-[12px] font-semibold uppercase ${language === l ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * Split-screen auth pattern (PRD 6.1a): illustration with glass carousel on the left (≥1024px),
 * white form side on the right with logo, help link, centred form (max 440px) and legal line.
 */
/** Public pages use TreeSyt's own brand, not the last company's. */
export function useNeutralBrand() {
  useEffect(() => {
    ['--brand', '--brand-hover', '--brand-soft'].forEach((v) => document.documentElement.style.removeProperty(v));
  }, []);
}

export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useT();
  useNeutralBrand();
  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row">
      <div className="relative h-[200px] shrink-0 overflow-hidden lg:sticky lg:top-0 lg:h-screen lg:w-1/2">
        <Illustration name="auth-1" />
        <div className="absolute inset-x-8 bottom-8 hidden lg:block xl:inset-x-12 xl:bottom-12">
          <GlassCarousel />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 py-6 lg:px-12 lg:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label={t('auth.home')}>
            <LogoBadge size={36} />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-4 text-[14px]">
            <LanguageToggle />
            <span className="hidden text-muted sm:inline">
              {t('auth.needHelp')}{' '}
              <Link to="/contact" className="text-link">{t('auth.contactSupport')}</Link>
            </span>
          </div>
        </div>
        <main className={cn('mx-auto flex w-full flex-1 flex-col justify-center py-10', wide ? 'max-w-[560px]' : 'max-w-[440px]')}>
          <div className="animate-rise">{children}</div>
        </main>
        <p className="text-center text-[12px] text-muted">
          {t('auth.legal')}{' '}
          <Link to="/legal/terms" className="text-link">{t('auth.terms')}</Link>
          {' · '}
          <Link to="/legal/privacy" className="text-link">{t('auth.privacy')}</Link>
        </p>
      </div>
      <DemoDock placement="public" />
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[32px] leading-tight lg:text-[36px]">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
    </div>
  );
}

/** Inline alert used on auth screens. */
export function AuthAlert({ tone = 'danger', children }: { tone?: 'danger' | 'warning' | 'success' | 'info'; children: ReactNode }) {
  const tones = { danger: 'border-danger/30 bg-danger/5 text-danger', warning: 'border-warning/30 bg-warning/5 text-warning', success: 'border-success/30 bg-success/5 text-success', info: 'border-info/30 bg-info/5 text-info' };
  return <div role="alert" className={cn('mb-6 rounded-ctl border px-4 py-3 text-[14px]', tones[tone])}>{children}</div>;
}
