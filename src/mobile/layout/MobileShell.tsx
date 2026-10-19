import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EnvironmentSync } from '@/app/providers';
import { ActorContext } from '@/stores/hooks';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useAccessStore } from '@/stores/accessStore';
import { MOBILE_FLOWS } from '@/app/routes';
import i18n from '@/i18n';
import { BottomTabs } from './BottomTabs';
import { RecordSheet } from './RecordSheet';
import { MobileSignIn, PinLock } from '@/mobile/flows/auth/MobileSignIn';
import '@/services/mobileHandlers';
import { DemoDock } from '@/components/shared/DemoDock';
import { CollectionPrompt } from '@/mobile/flows/money/CollectionPrompt';

/**
 * Mobile app shell (PRD 4.1–4.2): centred 390×844 viewport with a subtle device frame on desktop,
 * full screen on phones (and in the phone-sized window). Its own session, tabs and offline mode.
 */
export function MobileShell() {
  const session = useMobileSessionStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [recordOpen, setRecordOpen] = useState(false);
  const memberships = useAccessStore((s) => s.memberships);
  const users = useAccessStore((s) => s.users);

  // /m?org=…&user=…[&flow=M5] signs the window in as that field user (PRD 4.2).
  useEffect(() => {
    const org = params.get('org');
    const user = params.get('user');
    if (!org || !user) return;
    const u = users.find((x) => x.id === user);
    const member = memberships.some((m) => m.userId === user && m.orgId === org);
    if (u && member) {
      session.signIn(user, org, u.language);
      toast.success(i18n.t('mobile.signedInToast', { name: u.name, lng: u.language }));
    } else toast.error(i18n.t('mobile.notMember'));
    const flow = params.get('flow');
    const go = params.get('go');
    navigate(go?.startsWith('/m/') ? go : flow && (MOBILE_FLOWS as readonly string[]).includes(flow) ? `/m/flow/${flow}` : '/m', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const actor = useMemo(
    () => (session.userId && session.orgId ? { userId: session.userId, orgId: session.orgId, lang: session.language } : null),
    [session.userId, session.orgId, session.language],
  );

  useEffect(() => setRecordOpen(false), [location.pathname]);
  // Step-by-step flows take the whole screen; their sticky action button replaces the tab bar.
  const immersive = /^\/m\/(surveys\/.+|farmers\/(new|[^/]+\/edit)|communities\/.+|groups\/.+|buying\/(purchase|voice|pre\/new|requests\/new)|support\/new|recovery\/(new|[^/]+\/repay)|preview\/.+|tasks\/.+)/.test(location.pathname);

  return (
    <div className="min-h-[100dvh] bg-canvas frame:flex frame:items-center frame:justify-center frame:bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-soft)),_rgb(var(--canvas))_60%)] frame:p-6">
      <div className="relative mx-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-surface text-[16px] frame:h-[844px] frame:w-[390px] frame:rounded-[52px] frame:shadow-[0_0_0_10px_#0F2A20,0_0_0_11px_#2a3d34,0_30px_80px_rgba(15,42,32,0.35)]">
        {actor ? (
          <ActorContext.Provider value={actor}>
            <EnvironmentSync />
            <div className="flex min-h-0 flex-1 flex-col">
              <Outlet />
            </div>
            {!immersive && <BottomTabs onRecord={() => setRecordOpen(true)} />}
            <RecordSheet open={recordOpen} onClose={() => setRecordOpen(false)} />
            <CollectionPrompt />
            <PinLock />
          </ActorContext.Provider>
        ) : (
          <MobileSignIn />
        )}
        <DemoDock placement="mobile" />
      </div>
    </div>
  );
}
