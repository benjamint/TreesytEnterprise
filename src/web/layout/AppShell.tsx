import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { EnvironmentSync } from '@/app/providers';
import { defaultMobileUser, openMobileWindow } from '@/app/mobile';
import { onAnnounce } from '@/stores/persistence';
import { useActor, useCurrentOrg, useCurrentUser, useT } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';

/** Web app shell (PRD 4.1, 6.4): sidebar → icon rail at 1024 → sheet menu below. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const { orgId, userId } = useActor();
  const org = useCurrentOrg();
  const user = useCurrentUser();
  const { t } = useT();

  const openMobile = useCallback(() => {
    const { memberships, roles } = useAccessStore.getState();
    const uid = defaultMobileUser(orgId, userId, memberships, roles);
    if (uid) openMobileWindow(orgId, uid);
  }, [orgId, userId]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Toasts for things other tabs (e.g. the mobile window) announce.
  useEffect(
    () =>
      onAnnounce((key, params) => {
        if (key === 'synced') toast.success(t('shell.syncedToast', params));
      }),
    [t],
  );

  // Single-key shortcuts: ? help, M mobile (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'm' || e.key === 'M') openMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openMobile]);

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
        <SheetContent side="left" closeLabel={t('common.close')} className="w-[264px] p-0">
          <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} onSearch={() => setPaletteOpen(true)} onOpenMobile={openMobile} />
        <main id="main" className="flex-1 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
          <motion.div key={`${location.pathname}:${orgId}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </motion.div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenMobile={openMobile} />
    </div>
  );
}
