import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ExternalLink, FlaskConical, RotateCcw, Smartphone, Eye, LayoutGrid, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Disclosure } from './Disclosure';
import { Avatar } from './Avatar';
import { defaultMobileUser, openMobileWindow } from '@/app/mobile';
import { DEMO_PASSWORD } from '@/data/seed/platform';
import { signInAsPersona } from '@/services/authService';
import { resetDemoData } from '@/stores/persistence';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useDemoStore } from '@/stores/demoStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useActor, useFormat, useRoleName, useT } from '@/stores/hooks';
import { cn } from '@/lib/utils';

/**
 * Everything that exists only to drive the prototype lives here, behind one icon: demo codes and
 * email links, notes about the current page, persona sign-in, and prototype tools. The product UI
 * itself stays clean. Every section starts closed.
 */
export function DemoDock({ placement = 'web' }: { placement?: 'web' | 'public' | 'mobile' }) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { codes, links, notes, actions, unseen, markSeen, failNextPayout: failNext, setFailNextPayout: setFailNext } = useDemoStore();
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const orgs = usePlatformStore((s) => s.orgs);
  const { viewAs, setViewAs } = useSessionStore();
  const actor = useActor();
  const roleName = useRoleName();
  const navigate = useNavigate();
  const f = useFormat();
  const { t } = useT();
  const signedIn = placement !== 'public' && !!actor.userId;

  const personas = useMemo(
    () =>
      orgs
        .map((o) => ({
          org: o,
          items: users
            .filter((u) => u.persona && memberships.find((m) => m.userId === u.id)?.orgId === o.id)
            .map((u) => ({ u, m: memberships.find((m) => m.userId === u.id)! }))
            // In the mobile window only field users can sign in.
            .filter(({ m }) => placement !== 'mobile' || m.roleIds.some((r) => roles.find((x) => x.id === r)?.mobile)),
        }))
        .filter((g) => g.items.length),
    [orgs, users, memberships, roles, placement],
  );

  const pick = (userId: string) => {
    setOpen(false);
    const u = users.find((x) => x.id === userId);
    toast.success(t('shell.switchedPersona', { name: u?.name ?? '' }));
    if (placement === 'mobile') {
      const m = memberships.find((x) => x.userId === userId)!;
      useMobileSessionStore.getState().signIn(userId, m.orgId, u!.language);
      navigate('/m');
      return;
    }
    signInAsPersona(userId, actor.orgId);
    navigate('/app');
  };

  const openMobile = () => {
    const uid = defaultMobileUser(actor.orgId, actor.userId, memberships, roles);
    if (uid) openMobileWindow(actor.orgId, uid);
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast(t('demo.copied'));
    } catch {
      /* clipboard can be blocked; the code is visible anyway */
    }
  };

  const pos = placement === 'mobile' ? 'right-3 top-3' : 'bottom-5 right-5';
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) markSeen();
        else setConfirmReset(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('pointer-events-auto fixed z-[55] flex h-11 w-11 items-center justify-center rounded-full bg-badge-dark text-lime shadow-soft ring-4 ring-surface/80 transition-transform hover:scale-105', pos, placement === 'mobile' ? 'h-9 w-9' : 'demo-dock-web')}
          aria-label={t('demo.title')}
          data-tour="demo-dock"
        >
          <FlaskConical className={placement === 'mobile' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
          {unseen > 0 && <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-warning ring-2 ring-surface" aria-hidden="true" />}
        </button>
      </PopoverTrigger>
      <PopoverContent side={placement === 'mobile' ? 'bottom' : 'top'} align="end" className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-brand" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-ink">{t('demo.title')}</span>
          </div>
          <p className="mt-1 text-[13px] text-muted">{t('demo.subtitle')}</p>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 scrollbar-thin">
          {(codes.length > 0 || links.length > 0) && (
            <Disclosure title={t('demo.codes')} badge={<span className="tnum rounded-full bg-warning/10 px-2 text-[12px] font-semibold text-warning">{codes.length + links.length}</span>}>
              <ul className="space-y-2">
                {codes.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-ctl bg-canvas px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-muted">{`${t(`demo.code.${c.label}`)} · ${c.to} · ${f.relative(c.at)}`}</span>
                      <span className="tnum block font-mono text-[20px] font-semibold tracking-[0.2em] text-ink">{c.code}</span>
                    </span>
                    <Button variant="ghost" size="iconSm" onClick={() => copy(c.code)} aria-label={t('demo.copy')}>
                      <Copy />
                    </Button>
                  </li>
                ))}
                {links.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 rounded-ctl bg-canvas px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink">{t(`demo.link.${l.label}`)}</span>
                      <span className="block truncate text-[12px] text-muted">{`${l.to} · ${f.relative(l.at)}`}</span>
                    </span>
                    <Button variant="secondary" size="xs" onClick={() => { setOpen(false); navigate(l.href); }}>
                      <ExternalLink /> {t('common.open')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          <Disclosure title={t('demo.aboutPage')} badge={notes.length ? <span className="tnum rounded-full bg-brand-soft px-2 text-[12px] font-semibold text-brand">{notes.length}</span> : undefined}>
            {notes.length === 0 ? (
              <p className="text-[13px] text-muted">{t('demo.noNotes')}</p>
            ) : (
              <ul className="space-y-2.5">
                {notes.map((n) => (
                  <li key={n.id} className="text-[13px] leading-relaxed text-body">{t(n.key, n.params ?? {})}</li>
                ))}
              </ul>
            )}
          </Disclosure>

          {actions.length > 0 && (
            <Disclosure title={t('demo.pageActions')} badge={<span className="tnum rounded-full bg-brand-soft px-2 text-[12px] font-semibold text-brand">{actions.length}</span>}>
              <div className="space-y-2">
                {actions.map((a) => <Button key={a.id} variant="secondary" size="sm" className="h-auto min-h-10 w-full justify-start whitespace-normal py-2 text-left" onClick={() => { a.run(); setOpen(false); }}><Zap /> {t(a.key, a.params ?? {})}</Button>)}
              </div>
            </Disclosure>
          )}

          <Disclosure title={t('demo.signInAs')}>
            {placement !== 'mobile' && <p className="mb-3 text-[12px] text-muted">{t('demo.passwordHint', { password: DEMO_PASSWORD })}</p>}
            <div className="space-y-3">
              {personas.map((g) => (
                <div key={g.org.id}>
                  <div className="eyebrow mb-1">{g.org.name}</div>
                  <ul>
                    {g.items.map(({ u, m }) => (
                      <li key={u.id}>
                        <button type="button" onClick={() => pick(u.id)} className={cn('flex w-full items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left hover:bg-brand-soft/60', actor.userId === u.id && signedIn && 'bg-brand-soft')}>
                          <Avatar name={u.name} color={u.avatarColor} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink">{u.name}</span>
                            <span className="block truncate text-[12px] text-muted">{u.isPlatformOwner ? t('shell.platformBadge') : m.title ?? roleName(m.roleIds[0]!)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Disclosure>

          <Disclosure title={t('demo.tools')}>
            <div className="space-y-2">
              {signedIn && placement !== 'mobile' && (
                <>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={openMobile}>
                    <Smartphone /> {t('shell.openMobile')}
                  </Button>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => { setOpen(false); navigate('/app/help/mobile'); }}>
                    <LayoutGrid /> {t('shell.mobilePreviews')}
                  </Button>
                  <label className="flex items-center gap-3 rounded-ctl border border-line px-3.5 py-2.5">
                    <Eye className="h-[18px] w-[18px] text-muted" aria-hidden="true" />
                    <span className="flex-1">
                      <span className="block text-[14px] font-medium text-ink">{t('shell.viewAs')}</span>
                      <span className="block text-[12px] text-muted">{t('shell.viewAsHint')}</span>
                    </span>
                    <Switch checked={viewAs} onCheckedChange={setViewAs} aria-label={t('shell.viewAs')} />
                  </label>
                </>
              )}
              <label className="flex items-center gap-3 rounded-ctl border border-line px-3.5 py-2.5">
                <Zap className="h-[18px] w-[18px] text-muted" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-[14px] font-medium text-ink">{t('demo.failNext')}</span>
                  <span className="block text-[12px] text-muted">{t('demo.failNextHint')}</span>
                </span>
                <Switch checked={failNext} onCheckedChange={setFailNext} aria-label={t('demo.failNext')} />
              </label>
              {confirmReset ? (
                <div className="rounded-ctl border border-danger/30 bg-danger/5 p-3">
                  <p className="text-[13px] text-body">{t('shell.resetConfirm')}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="xs" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</Button>
                    <Button variant="danger" size="xs" onClick={resetDemoData}>{t('shell.resetDemo')}</Button>
                  </div>
                </div>
              ) : (
                <Button variant="dangerOutline" size="sm" className="w-full justify-start" onClick={() => setConfirmReset(true)}>
                  <RotateCcw /> {t('shell.resetDemo')}
                </Button>
              )}
            </div>
          </Disclosure>
        </div>
      </PopoverContent>
    </Popover>
  );
}
