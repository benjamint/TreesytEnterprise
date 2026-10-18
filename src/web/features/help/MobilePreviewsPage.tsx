import { useMemo, useState } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { Avatar } from '@/components/shared/Avatar';
import { MOBILE_FLOWS, MOBILE_FLOW_PHASE } from '@/app/routes';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { defaultMobileUser, openMobileWindow } from '@/app/mobile';
import { useActor, useT } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';

/** Mobile previews (PRD 4.2): every mobile flow with an "Open" button that launches it in the mobile window. */
export function MobilePreviewsPage() {
  const { orgId, userId } = useActor();
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const users = useAccessStore((s) => s.users);
  const { t } = useT();
  const fieldUsers = useMemo(
    () =>
      memberships
        .filter((m) => m.orgId === orgId && m.roleIds.some((r) => roles.find((x) => x.id === r)?.mobile))
        .map((m) => ({ m, u: users.find((u) => u.id === m.userId)! }))
        .sort((a, b) => Number(!!b.u.persona) - Number(!!a.u.persona)),
    [memberships, roles, users, orgId],
  );
  const [selected, setSelected] = useState<string | null>(() => defaultMobileUser(orgId, userId, memberships, roles));
  const current = fieldUsers.find((f) => f.u.id === selected) ?? fieldUsers[0];
  useDemoNotes(MOBILE_FLOWS.map((flow) => ({ id: flow, key: 'demo.note.flowPhase', params: { flow, phase: MOBILE_FLOW_PHASE[flow] } })));

  return (
    <>
      <PageHeader
        title={t('nav.helpMobile')}
        description={t('pages.helpMobile')}
        primary={
          current && (
            <Button onClick={() => openMobileWindow(orgId, current.u.id)}>
              <Smartphone /> {t('shell.openMobileAs', { name: current.u.name })}
            </Button>
          )
        }
      />
      <p className="mb-6 max-w-2xl text-[15px] text-muted">{t('mobileFlows.intro')}</p>
      {fieldUsers.length > 0 && (
        <div className="mb-8">
          <div className="eyebrow mb-3">{t('mobileFlows.openAs')}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('mobileFlows.openAs')}>
            {fieldUsers.slice(0, 8).map(({ u, m }) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={current?.u.id === u.id}
                onClick={() => setSelected(u.id)}
                className={`flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-left transition-colors ${current?.u.id === u.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/40'}`}
              >
                <Avatar name={u.name} color={u.avatarColor} size={30} />
                <span>
                  <span className="block text-[13px] font-semibold leading-tight text-ink">{u.name}</span>
                  <span className="block text-[12px] leading-tight text-muted">{m.title}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {MOBILE_FLOWS.map((flow) => (
          <Card key={flow} className="flex flex-col justify-between gap-5 p-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[13px] font-semibold text-brand">{flow}</span>
              </div>
              <h2 className="text-[17px]">{t(`mobileFlows.${flow}.title`)}</h2>
              <p className="mt-1 text-[14px] text-muted">{t(`mobileFlows.${flow}.desc`)}</p>
            </div>
            <Button variant="secondary" disabled={!current} onClick={() => current && openMobileWindow(orgId, current.u.id, flow)}>
              <ExternalLink /> {t('mobileFlows.open')}
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}
