import { useEffect, useState } from 'react';
import { RouteBoundary } from '@/components/shared/RouteBoundary';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { EnvironmentSync } from '@/app/providers';
import { DemoDock } from '@/components/shared/DemoDock';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { SessionTimeout } from './SessionTimeout';
import '@/services/aggregatorService';
import '@/services/supportService';
import '@/services/recoveryService';
import '@/services/inventoryService';
import { onAnnounce } from '@/stores/persistence';
import { useActor, useCurrentOrg, useCurrentUser, useT } from '@/stores/hooks';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';

/** Web app shell (PRD 4.1, 6.4): sidebar → icon rail at 1024 → sheet menu below. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const { orgId } = useActor();
  const org = useCurrentOrg();
  const user = useCurrentUser();
  const { t } = useT();


  useEffect(() => setMenuOpen(false), [location.pathname]);
  // Signed in: drop any half-finished sign-in flow kept for the 2-step / company steps.
  useEffect(() => useAuthFlowStore.getState().clear(), []);

  // Toasts for things other tabs (e.g. the mobile window) announce.
  useEffect(
    () =>
      onAnnounce((key, params) => {
        if (key === 'synced') toast.success(t('shell.syncedToast', params));
        if (key === 'mobileSynced') toast.success(t('shell.mobileSyncedToast', params));
        if (key === 'mobileSaved') toast.success(t('shell.mobileSavedToast', params));
      }),
    [t],
  );

  if (!user || !org) return null;
  return (
    <div className="flex min-h-screen bg-canvas">
      <EnvironmentSync />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-ctl focus:bg-surface focus:px-4 focus:py-2">
        {t('common.skipToContent')}
      </a>
      <aside className="sticky top-0 hidden h-screen shrink-0 border-r border-line lg:block xl:hidden">
        <Sidebar rail />
      </aside>
      <aside className="sticky top-0 hidden h-screen shrink-0 border-r border-line xl:block">
        <Sidebar />
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" closeLabel={t('common.close')} className="w-[248px] p-0">
          <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <main id="main" className="flex-1 px-4 py-7 md:px-8 lg:px-12 lg:py-10">
          <motion.div key={`${location.pathname}:${orgId}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mx-auto w-full max-w-[1360px]">
            <RouteBoundary key={location.pathname}><Outlet /></RouteBoundary>
          </motion.div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <DemoDock />
      <SessionTimeout />
    </div>
  );
}
