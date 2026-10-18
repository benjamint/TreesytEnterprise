import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Landscape } from '@/components/shared/Landscape';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { comingSoon } from '@/components/shared/coming-soon';
import { DEFAULT_SESSION, useSessionStore } from '@/stores/sessionStore';
import { useT } from '@/stores/hooks';
import { cn } from '@/lib/utils';

/**
 * Phase 1 public page in the split-screen auth pattern (PRD 6.1a). The full landing page,
 * book-a-demo, sign-up and sign-in arrive in phase 2.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const { userId, signIn } = useSessionStore();
  const [slide, setSlide] = useState(0);
  const { t } = useT();
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), 6000);
    return () => clearInterval(id);
  }, []);
  const slideText = [t('public.tagline'), t('carousel.payments'), t('carousel.config')];

  const enter = () => {
    if (!userId) signIn(DEFAULT_SESSION.userId, DEFAULT_SESSION.orgId, DEFAULT_SESSION.language);
    navigate('/app');
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row">
      <div className="relative h-[200px] overflow-hidden lg:sticky lg:top-0 lg:h-screen lg:w-1/2">
        <Landscape />
        <div className="absolute inset-x-6 bottom-6 hidden lg:block xl:inset-x-12 xl:bottom-12">
          <div className="glass rounded-panel p-10">
            <p className="min-h-[96px] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">{slideText[slide]}</p>
            <div className="mt-6 flex items-center gap-2" role="tablist">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={slide === i}
                  aria-label={slideText[i]}
                  onClick={() => setSlide(i)}
                  className={cn('h-2 rounded-full transition-all duration-200', slide === i ? 'w-8 bg-brand' : 'w-2 bg-ink/25')}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-6 py-8 lg:px-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoBadge size={36} />
            <Wordmark />
          </div>
          <button type="button" className="text-link text-[14px]" onClick={() => comingSoon()}>
            {t('public.bookDemo')}
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[36px] leading-tight lg:text-[40px]">{userId ? t('public.tagline') : t('public.signedOutTitle')}</h1>
          <p className="mt-3 text-[16px] text-muted">{t('public.intro')}</p>
          <Button size="lg" className="mt-8 w-full" onClick={enter}>
            {t('public.enterDemo')} <ArrowRight />
          </Button>
          <Button size="lg" variant="secondary" className="mt-3 w-full" onClick={() => comingSoon()}>
            {t('public.signIn')}
          </Button>
          <p className="mt-6 text-center text-[13px] text-muted">{t('public.phaseNote')}</p>
        </div>
      </div>
    </div>
  );
}
