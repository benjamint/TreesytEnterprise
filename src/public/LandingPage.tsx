import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CreditCard, FileText, HandHeart, Languages, Map, Radar, ShieldCheck, ShoppingBasket, Smartphone, Sparkles, Trees, Truck, Users, Warehouse, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Landscape } from '@/components/shared/Landscape';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { DemoDock } from '@/components/shared/DemoDock';
import { GlassCarousel, LanguageToggle, useNeutralBrand } from './auth/AuthLayout';
import { useT } from '@/stores/hooks';

const MODULES = [
  ['farmers', Users], ['buying', ShoppingBasket], ['payments', CreditCard], ['support', HandHeart], ['inventory', Warehouse], ['dispatch', Truck],
  ['traceboard', Radar], ['trees', Trees], ['eudr', BadgeCheck], ['forms', FileText], ['mobile', Smartphone], ['ai', Sparkles],
] as const;

const FLOW = ['field', 'approve', 'pay', 'store', 'ship', 'trace'] as const;

/** Public landing page (PRD A1): product story, modules overview, Book a demo, Start free trial, Sign in. */
export function LandingPage() {
  const { t } = useT();
  useNeutralBrand();
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label={t('auth.home')}>
            <LogoBadge size={34} />
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-6 text-[14px] font-medium text-body md:flex" aria-label={t('landing.navLabel')}>
            <a href="#how" className="hover:text-ink">{t('landing.nav.how')}</a>
            <a href="#modules" className="hover:text-ink">{t('landing.nav.modules')}</a>
            <a href="#companies" className="hover:text-ink">{t('landing.nav.companies')}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block"><LanguageToggle /></div>
            <Link to="/sign-in" className="text-link px-2 text-[14px] font-medium">{t('auth.signIn')}</Link>
            <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex"><Link to="/book-a-demo">{t('landing.bookDemo')}</Link></Button>
            <Button asChild size="sm"><Link to="/sign-up">{t('landing.startTrial')}</Link></Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <div className="eyebrow mb-4">{t('landing.eyebrow')}</div>
          <h1 className="text-[40px] leading-[1.08] lg:text-[56px]">{t('landing.title')}</h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-body">{t('landing.subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/sign-up">{t('landing.startTrial')} <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="secondary"><Link to="/book-a-demo">{t('landing.bookDemo')}</Link></Button>
          </div>
          <p className="mt-4 text-[13px] text-muted">{t('landing.trialNote')}</p>
        </div>
        <div className="relative h-[460px] overflow-hidden rounded-panel shadow-soft lg:h-[560px]">
          <Landscape />
          <div className="absolute inset-x-6 bottom-6"><GlassCarousel className="p-8" /></div>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-canvas py-16 lg:py-20">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="eyebrow mb-3">{t('landing.how.eyebrow')}</div>
          <h2 className="max-w-2xl text-[32px] leading-tight">{t('landing.how.title')}</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {FLOW.map((k, i) => (
              <li key={k} className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <span className="tnum text-[13px] font-semibold text-brand">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-2 text-[16px]">{t(`landing.how.${k}.title`)}</h3>
                <p className="mt-1 text-[14px] text-muted">{t(`landing.how.${k}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="modules" className="py-16 lg:py-20">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="eyebrow mb-3">{t('landing.modules.eyebrow')}</div>
          <h2 className="max-w-2xl text-[32px] leading-tight">{t('landing.modules.title')}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(([k, Icon]) => (
              <div key={k} className="rounded-card border border-line p-6 transition-colors hover:border-brand/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-4 text-[16px]">{t(`landing.modules.${k}.title`)}</h3>
                <p className="mt-1 text-[14px] text-muted">{t(`landing.modules.${k}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="companies" className="bg-badge-dark py-16 text-white lg:py-20">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-lime">{t('landing.config.eyebrow')}</div>
            <h2 className="mt-3 text-[32px] leading-tight text-white">{t('landing.config.title')}</h2>
            <p className="mt-4 text-[16px] text-white/75">{t('landing.config.body')}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {([['workflow', Workflow], ['language', Languages], ['places', Map], ['controls', ShieldCheck]] as const).map(([k, Icon]) => (
              <li key={k} className="rounded-card border border-white/10 bg-white/5 p-5">
                <Icon className="h-5 w-5 text-lime" aria-hidden="true" />
                <h3 className="mt-3 text-[16px] text-white">{t(`landing.config.${k}.title`)}</h3>
                <p className="mt-1 text-[14px] text-white/70">{t(`landing.config.${k}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="mx-auto max-w-[880px] px-6 text-center">
          <h2 className="text-[32px] leading-tight">{t('landing.cta.title')}</h2>
          <p className="mt-3 text-[16px] text-muted">{t('landing.cta.body')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link to="/sign-up">{t('landing.startTrial')}</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link to="/book-a-demo">{t('landing.bookDemo')}</Link></Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-6 text-[13px] text-muted sm:flex-row">
          <div className="flex items-center gap-2"><LogoBadge size={24} /><span>{t('landing.footer')}</span></div>
          <div className="flex gap-5">
            <Link to="/contact" className="hover:text-ink">{t('landing.contact')}</Link>
            <Link to="/legal/terms" className="hover:text-ink">{t('auth.terms')}</Link>
            <Link to="/legal/privacy" className="hover:text-ink">{t('auth.privacy')}</Link>
          </div>
        </div>
      </footer>
      <DemoDock placement="public" />
    </div>
  );
}
