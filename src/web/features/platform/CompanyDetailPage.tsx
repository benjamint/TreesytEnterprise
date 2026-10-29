import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyLogo } from '@/components/shared/Logo';
import { Flag } from '@/components/shared/Flag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { MODULES } from '@/engines/permissions';
import { formatDate } from '@/lib/format';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAccessStore } from '@/stores/accessStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useActivityStore } from '@/stores/activityStore';
import { useFormat, useT } from '@/stores/hooks';
import { formatMoney } from '@/engines/money';
import { CompanyActions } from './CompanyActions';
import { usePlatformStats } from './usePlatformStats';
import { AuditTable } from './PlatformAuditPage';

const MONTHS = 6;

function UsageChart({ title, data, format }: { title: string; data: { month: string; value: number }[]; format: (n: number) => string }) {
  const { t } = useT();
  const empty = data.every((d) => d.value === 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[14px]">{title}</CardTitle>
        <span className="tnum text-[14px] font-semibold text-ink">{format(data[data.length - 1]?.value ?? 0)}</span>
      </CardHeader>
      <CardContent className="h-[180px] pt-2">
        {empty ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted">{t('platform.noUsage')}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'rgb(var(--brand-soft))' }}
                formatter={(v: number) => [format(v), title]}
                contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--line))', background: 'rgb(var(--surface))', color: 'rgb(var(--ink))', fontSize: 13 }}
                labelStyle={{ color: 'rgb(var(--muted))' }}
              />
              <Bar dataKey="value" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Company detail (PRD A3): usage, modules, plan, admin contacts, data-sharing grants, audit. */
export function CompanyDetailPage() {
  const { orgId } = useParams();
  const org = usePlatformStore((s) => s.orgs.find((o) => o.id === orgId));
  const plans = usePlatformStore((s) => s.plans);
  const orgs = usePlatformStore((s) => s.orgs);
  const grants = usePlatformStore((s) => s.grants);
  const settings = useSettingsStore((s) => (orgId ? s.settings[orgId] : undefined));
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const invites = useAccessStore((s) => s.invites);
  const purchases = useBuyingStore((s) => s.purchases);
  const payments = usePaymentStore((s) => s.payments);
  const audit = useActivityStore((s) => s.audit);
  const stats = usePlatformStats();
  const f = useFormat();
  const { t } = useT();

  const usage = useMemo(() => {
    if (!org) return null;
    const now = new Date();
    const buckets = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, month: formatDate(d, org.timezone, f.lang, 'MMM') };
    });
    const mine = purchases.filter((p) => p.orgId === org.id);
    const pays = payments.filter((p) => p.orgId === org.id && p.status === 'SUCCESSFUL');
    const k = (iso: string) => iso.slice(0, 7);
    return {
      agents: buckets.map((b) => ({ month: b.month, value: new Set(mine.filter((p) => k(p.createdAt) === b.key).map((p) => p.agentId)).size })),
      records: buckets.map((b) => ({ month: b.month, value: mine.filter((p) => k(p.createdAt) === b.key).length })),
      payouts: buckets.map((b) => ({ month: b.month, value: pays.filter((p) => k(p.createdAt) === b.key).reduce((s, p) => s + p.amount.amountMinor, 0) })),
    };
  }, [org, purchases, payments, f.lang]);

  if (!org || !settings || !usage) return <Navigate to="/app/platform/companies" replace />;
  const plan = plans.find((p) => p.id === org.planId);
  const admins = memberships
    .filter((m) => m.orgId === org.id && m.roleIds.some((r) => roles.find((x) => x.id === r)?.template === 'companyAdmin'))
    .map((m) => ({ m, u: users.find((u) => u.id === m.userId)! }))
    .filter((x) => x.u);
  const orgGrants = grants.filter((g) => g.fromOrgId === org.id || g.toOrgId === org.id);
  const orgAudit = audit.filter((a) => a.orgId === org.id);
  const pending = invites.filter((i) => i.orgId === org.id && i.status === 'PENDING');
  const agents = stats.activeAgents[org.id] ?? 0;
  const farmers = stats.farmerCount[org.id] ?? 0;
  const money = (v: number) => formatMoney(v, org.currency, org.locale, { compact: true });

  return (
    <>
      <Link to="/app/platform/companies" className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('platform.page.companies')}
      </Link>
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <CompanyLogo text={org.branding.logoText} color={org.branding.primaryColor} size={56} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[30px] leading-tight">{org.name}</h1>
              <StatusBadge status={org.status} />
            </div>
            <p className="mt-1 flex items-center gap-2 text-[14px] text-muted">
              {org.countries.map((c) => <Flag key={c} code={c} />)}
              {`${t(`orgType.${org.type}`)} · ${org.legalName} · ${org.currency} · ${t('platform.since', { date: f.date(org.createdAt) })}`}
            </p>
          </div>
        </div>
        <CompanyActions org={org} variant="buttons" />
      </header>

      <section className="mb-6 grid gap-4 lg:grid-cols-3" aria-label={t('platform.usage')}>
        <UsageChart title={t('platform.usageAgents')} data={usage.agents} format={(n) => f.number(n)} />
        <UsageChart title={t('platform.usageRecords')} data={usage.records} format={(n) => f.number(n)} />
        <UsageChart title={t('platform.usagePayouts')} data={usage.payouts} format={money} />
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t('platform.plan')}</CardTitle><Badge tone="brand">{plan?.name}</Badge></CardHeader>
          <CardContent className="space-y-4 pt-4">
            {[
              ['platform.col.agents', agents, plan?.limits.agents ?? 1],
              ['col.farmers', farmers, plan?.limits.farmers ?? 1],
            ].map(([k, v, max]) => (
              <div key={k as string}>
                <div className="mb-1.5 flex justify-between text-[13px]"><span className="text-muted">{t(k as string)}</span><span className="tnum font-medium text-ink">{`${f.number(v as number)} / ${f.number(max as number)}`}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, ((v as number) / (max as number)) * 100)}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>{t('platform.modules')}</CardTitle><span className="tnum text-[13px] text-muted">{t('platform.modulesOn', { count: stats.modules[org.id] ?? 0, total: MODULES.length })}</span></CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-4">
            {MODULES.map((m) => (
              <Badge key={m.key} tone={settings.modules[m.key] ? 'brand' : 'neutral'} className={settings.modules[m.key] ? '' : 'text-muted line-through'}>{t(`module.${m.key}`)}</Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('platform.admins')}</CardTitle></CardHeader>
          <CardContent className="pt-4">
            {admins.length === 0 && pending.length === 0 ? (
              <p className="text-[14px] text-muted">{t('platform.noAdmins')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {admins.map(({ u, m }) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{u.name}</span>
                      <span className="flex items-center gap-1.5 text-[13px] text-muted"><Mail className="h-3.5 w-3.5" /> {u.email}</span>
                    </span>
                    <StatusBadge status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('platform.grants')}</CardTitle></CardHeader>
          <CardContent className="pt-4">
            {orgGrants.length === 0 ? (
              <p className="text-[14px] text-muted">{t('platform.noGrants')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {orgGrants.map((g) => {
                  const other = orgs.find((o) => o.id === (g.fromOrgId === org.id ? g.toOrgId : g.fromOrgId));
                  return (
                    <li key={g.id} className="py-3">
                      <div className="text-[14px] font-medium text-ink">{t(g.fromOrgId === org.id ? 'platform.grantTo' : 'platform.grantFrom', { company: other?.name ?? '' })}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">{g.scopes.map((s) => <Badge key={s}>{t(`platform.scope.${s}`)}</Badge>)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="eyebrow mb-3">{t('platform.page.audit')}</h2>
      {orgAudit.length ? <AuditTable rows={orgAudit} /> : <EmptyState title={t('platform.noAudit')} />}
    </>
  );
}
