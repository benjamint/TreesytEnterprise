import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { LogoBadge } from '@/components/shared/Logo';
import { termVariables } from '@/engines/terminology';
import { brandTokens, channels } from '@/lib/color';
// Every domain store must be registered before boot hydrates them.
import '@/stores';
import { bootStores, persistenceEvents, useBootStore } from '@/stores/persistence';
import { useSessionStore } from '@/stores/sessionStore';
import { useCurrentOrg, useLang, useTerms } from '@/stores/hooks';
import i18n from '@/i18n';

const DEFAULT_BRAND = '#14583F';

/** Keeps i18next, <html lang>, terminology variables, theme and company branding in step with the actor. */
export function EnvironmentSync() {
  const lang = useLang();
  const terms = useTerms();
  const org = useCurrentOrg();
  const theme = useSessionStore((s) => s.theme);

  useEffect(() => {
    i18n.options.interpolation = { ...i18n.options.interpolation, defaultVariables: termVariables(terms) };
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang, terms]);

  useEffect(() => {
    const root = document.documentElement;
    const dark = theme === 'dark';
    root.classList.toggle('dark', dark);
    const color = org?.branding.primaryColor ?? DEFAULT_BRAND;
    if (color.toUpperCase() === DEFAULT_BRAND) {
      ['--brand', '--brand-hover', '--brand-soft'].forEach((v) => root.style.removeProperty(v));
    } else {
      const tk = brandTokens(color, dark);
      root.style.setProperty('--brand', channels(tk.brand));
      root.style.setProperty('--brand-hover', channels(tk.hover));
      root.style.setProperty('--brand-soft', channels(tk.soft));
    }
  }, [theme, org?.branding.primaryColor]);

  return null;
}

/** Hydrate and (first time) seed every store before rendering the app. */
export function BootGate({ children }: { children: ReactNode }) {
  const ready = useBootStore((s) => s.ready);
  const progress = useBootStore((s) => s.progress);
  const { t } = useTranslation();
  useEffect(() => {
    void bootStores();
    const onQuota = () => toast.error(t('shell.quotaWarning'));
    persistenceEvents.addEventListener('quota', onQuota);
    return () => persistenceEvents.removeEventListener('quota', onQuota);
  }, [t]);
  if (ready) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas" role="status" aria-live="polite">
      <LogoBadge size={56} className="animate-pulse" />
      <div className="text-center">
        <p className="text-[15px] font-medium text-ink">{t('boot.loading')}</p>
        <p className="mt-1 text-[13px] text-muted">{t('boot.seeding')}</p>
      </div>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-all duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const theme = useSessionStore((s) => s.theme);
  return (
    <TooltipProvider delayDuration={250}>
      <BootGate>{children}</BootGate>
      {/* Toasts sit at the top: clear of the mobile tabs and of the Demo icon (bottom-right). */}
      <Toaster theme={theme} position={window.location.pathname.startsWith('/m') ? 'top-center' : 'top-right'} />
    </TooltipProvider>
  );
}
