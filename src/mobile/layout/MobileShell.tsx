import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RouteBoundary } from '@/components/shared/RouteBoundary';
import { EnvironmentSync } from '@/app/providers';
import { ActorContext } from '@/stores/hooks';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useAccessStore } from '@/stores/accessStore';
import { MOBILE_FLOWS } from '@/app/routes';
import i18n from '@/i18n';
import { BottomTabs } from './BottomTabs';
import { DeviceFrame } from './DeviceFrame';
import { RecordSheet } from './RecordSheet';
import { MobileSignIn, PinLock } from '@/mobile/flows/auth/MobileSignIn';
import '@/services/mobileHandlers';
import { DemoDock } from '@/components/shared/DemoDock';
import { CollectionPrompt } from '@/mobile/flows/money/CollectionPrompt';
import { useSystemStore } from '@/stores/systemStore';
import { demoDeviceId, registerDemoDevice } from '@/services/systemService';

/**
 * Mobile app shell (PRD 4.1–4.2): centred 390×844 viewport inside a phone frame on desktop,
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
      registerDemoDevice(user, org);
      session.signIn(user, org, u.language);
      toast.success(i18n.t('mobile.signedInToast', { name: u.name, lng: u.language }));
    } else toast.error(i18n.t('mobile.notMember'));
    const flow = params.get('flow');
    const go = params.get('go');
    navigate(go?.startsWith('/m/') ? go : flow && (MOBILE_FLOWS as readonly string[]).includes(flow) ? `/m/flow/${flow}` : '/m', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // This window is the agent's phone: the office can sign it out (PRD K3).
  const deviceStatus = useSystemStore((s) => s.devices.find((d) => d.id === demoDeviceId(session.userId ?? ''))?.status);
  useEffect(() => {
    if (!session.userId || !session.orgId) return;
    if (deviceStatus === 'SIGNED_OUT') {
      session.signOut();
      toast.warning(i18n.t('mobile.deviceSignedOut'));
    } else if (!deviceStatus) registerDemoDevice(session.userId, session.orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, session.orgId, deviceStatus]);

  const actor = useMemo(
    () => (session.userId && session.orgId ? { userId: session.userId, orgId: session.orgId, lang: session.language } : null),
    [session.userId, session.orgId, session.language],
  );

  useEffect(() => setRecordOpen(false), [location.pathname]);
  // Large phone-app controls apply to the whole document, so sheets rendered in portals get them too.
  useEffect(() => {
    document.documentElement.classList.add('mobile-ui');
    return () => document.documentElement.classList.remove('mobile-ui');
  }, []);
  // Step-by-step flows take the whole screen; their sticky action button replaces the tab bar.
  const immersive = /^\/m\/(surveys\/.+|farmers\/(new|[^/]+\/edit)|communities\/.+|groups\/.+|buying\/(purchase|voice|pre\/new|requests\/new)|support\/new|me\/feedback|warehouse\/(receive|outbound|count|resolve)|recovery\/(new|[^/]+\/repay)|preview\/.+|tasks\/.+)/.test(location.pathname);

  return (
    <DeviceFrame>
        {actor ? (
          <ActorContext.Provider value={actor}>
            <EnvironmentSync />
            <div className="flex min-h-0 flex-1 flex-col">
              <RouteBoundary phone key={location.pathname}><Outlet /></RouteBoundary>
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
    </DeviceFrame>
  );
}
