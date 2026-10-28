import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Flag, Loader2, Network, Pencil, Smartphone, UserPlus, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import type { Agent } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { Avatar } from '@/components/shared/Avatar';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { openMobileWindow } from '@/app/mobile';
import { agentBlocks, budgetStage, mondayOf, openReports, outstandingMinor } from '@/services/fieldService';
import { agentScore, cashPosition, fieldPoints, inviteAgent, inviteProblems, modelFor, reassignAgent, setAgentAreas, setAgentStatus, updateWallet } from '@/services/teamService';
import { detectProvider, lookupPayee } from '@/services/paymentService';
import { agentCashHeld } from '@/stores/selectors';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useLocationStore } from '@/stores/locationStore';
import { useActivityStore } from '@/stores/activityStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { LandMap } from '@/web/features/land/shared';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { KIND_COLOR } from './FieldActivityPage';
import { AgentName, FieldStatus, PctCell, selectCls, useFieldLookups } from './shared';
import { NewReportDialog } from './AgentReportsPage';
import { useSystemStore } from '@/stores/systemStore';
import { usePlatformStore } from '@/stores/platformStore';
import { belowMinimum } from '@/services/systemService';
import { DeviceActions } from '@/web/features/system/SyncPage';
import { SysStatus } from '@/web/features/system/shared';

/** Agents (PRD J1): list with cash, target, score and flags; invite by SMS; detail with areas, wallet, cash, plans, scores, commissions, reports, devices, GPS. */
export function AgentsPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const rows = fl.agents;
  const requests = useOrgRows(useBuyingStore((s) => s.requests));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const warehouses = useOrgRows(useWarehouseStore((s) => s.warehouses));
  useFieldStore((s) => s.reports);
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [manager, setManager] = useState('');
  const [inviting, setInviting] = useState(false);
  const cash = useMemo(() => new Map(rows.map((a) => [a.id, agentCashHeld(a.id, requests, purchases)])), [rows, requests, purchases]);
  const node = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const provider = (id: string) => settings.paymentProviders.find((p) => p.id === id)?.name ?? id;
  const query = q.trim().toLowerCase();
  const shown = rows.filter((a) => (!status || a.status === status) && (!type || a.agentTypeId === type) && (!manager || a.managerIds.includes(manager)) && (!query || [fl.agentName(a.id), fl.userOf(a.userId)?.phone ?? ''].some((x) => x.toLowerCase().includes(query))));
  const columns = useMemo<ColumnDef<Agent, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorFn: (a) => fl.agentName(a.id), cell: (c) => <span className="flex items-center gap-2.5"><Avatar name={fl.agentName(c.row.original.id)} color={fl.userOf(c.row.original.userId)?.avatarColor ?? '#14583F'} size={30} /><AgentName id={c.row.original.id} /></span> },
    { id: 'type', header: t('field.agentType'), accessorFn: (a) => fl.agentType(a.agentTypeId) },
    { id: 'phone', header: t('col.phone'), accessorFn: (a) => fl.userOf(a.userId)?.phone ?? '', cell: (c) => <span className="whitespace-nowrap tnum">{formatPhone(c.getValue() as string)}</span> },
    { id: 'areas', header: t('field.areas'), accessorFn: (a) => a.areaNodeIds.map(node).join(', '), cell: (c) => <span className="line-clamp-1 max-w-[180px]">{c.getValue() as string || '—'}</span> },
    { id: 'managers', header: t('field.managers'), accessorFn: (a) => a.managerIds.map((m) => fl.user(m)).join(', ') },
    { id: 'warehouse', header: t('field.warehouse'), accessorFn: (a) => warehouses.find((w) => w.id === a.warehouseId)?.name ?? '—' },
    { id: 'wallet', header: t('field.wallet'), accessorFn: (a) => a.wallet.number, cell: (c) => { const a = c.row.original; return <span className="whitespace-nowrap text-[13px]"><span className="tnum">{a.wallet.number}</span><span className="block text-[12px] text-muted">{`${provider(a.wallet.providerId)} · ${a.wallet.verifiedName}`}</span></span>; } },
    { id: 'cash', header: t('field.cashHeld'), accessorFn: (a) => cash.get(a.id) ?? 0, cell: (c) => <span className="tnum">{f.money(c.getValue() as number)}</span> },
    { id: 'target', header: t('field.weekTarget'), accessorKey: 'weekTargetPct', cell: (c) => <PctCell pct={c.getValue() as number} /> },
    { id: 'score', header: t('field.score'), accessorKey: 'score', cell: (c) => <span className="tnum font-medium text-ink">{f.number(c.getValue() as number)}</span> },
    { id: 'flags', header: t('field.flags'), accessorFn: (a) => openReports(a.orgId, a.id).length, cell: (c) => (c.getValue() as number) ? <Badge tone="danger"><Flag className="h-3 w-3" /> {c.getValue() as number}</Badge> : <span className="text-muted">{'—'}</span> },
    { id: 'sync', header: t('field.lastSync'), accessorKey: 'lastSyncAt', cell: (c) => (c.getValue() ? <span className="whitespace-nowrap text-muted">{f.dateTime(c.getValue() as string)}</span> : <span className="text-muted">{'—'}</span>) },
    { id: 'app', header: t('field.appVersion'), accessorKey: 'appVersion', cell: (c) => <span className="font-mono text-[12px]">{(c.getValue() as string) || '—'}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <FieldStatus status={c.getValue() as string} /> },
  ], [t, f, fl, cash, nodes, warehouses, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = rows.find((a) => a.id === openId);
  const active = rows.filter((a) => a.status === 'ACTIVE');
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.agents')} description={t('pages.agents')}
        actions={<Button variant="secondary" asChild><Link to="/app/agents/reporting-lines"><Network /> {t('nav.reportingLines')}</Link></Button>}
        primary={<PermissionGate permission="agents.create"><Button onClick={() => setInviting(true)}><UserPlus /> {t('field.inviteAgent')}</Button></PermissionGate>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('field.activeAgents')} value={f.number(active.length)} hint={t('field.invitedN', { count: rows.filter((a) => a.status === 'INVITED').length })} icon={UsersRound} />
        <StatCard label={t('field.cashHeld')} value={f.money([...cash.values()].reduce((s, x) => s + x, 0))} />
        <StatCard label={t('field.avgWeekTarget')} value={`${active.length ? Math.round(active.reduce((s, a) => s + a.weekTargetPct, 0) / active.length) : 0}%`} />
        <StatCard label={t('field.flaggedAgents')} value={f.number(rows.filter((a) => agentBlocks(a.orgId, a.id).flagged).length)} icon={Flag} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchAgents')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['ACTIVE', 'INVITED', 'DEACTIVATED'] as const).map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((a) => a.status === s).length }))]}
        filters={[
          { key: 'type', label: t('field.agentType'), value: type, onChange: setType, options: settings.agentTypes.map((x) => ({ value: x.id, label: fl.agentType(x.id) })) },
          { key: 'manager', label: t('field.manager'), value: manager, onChange: setManager, options: fl.supervisors.map((m) => ({ value: m, label: fl.user(m) })) },
        ]}
        onClear={() => { setQ(''); setStatus(''); setType(''); setManager(''); }} />
      <DataTable columns={columns} data={shown} onRowClick={(a) => open(a.id)} activeId={openId} getRowId={(a) => a.id} empty={t('field.noAgents')} columnPicker initialHidden={['warehouse', 'app']}
        exportCsv={{ fileName: 'agents.csv', columns: [{ header: t('col.name'), value: (a) => fl.agentName(a.id) }, { header: t('field.agentType'), value: (a) => fl.agentType(a.agentTypeId) }, { header: t('col.phone'), value: (a) => fl.userOf(a.userId)?.phone ?? '' }, { header: t('field.wallet'), value: (a) => a.wallet.number }, { header: t('field.cashHeld'), value: (a) => (cash.get(a.id) ?? 0) / 100 }, { header: t('field.weekTarget'), value: (a) => a.weekTargetPct }, { header: t('field.score'), value: (a) => a.score }, { header: t('col.status'), value: (a) => a.status }] }} />
      {current && <AgentDrawer key={current.id} a={current} onClose={close} />}
      {inviting && <InviteSheet onClose={(id) => { setInviting(false); if (id) open(id); }} />}
    </>
  );
}

function AgentDrawer({ a, onClose }: { a: Agent; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const fl = useFieldLookups();
  const can = useCan();
  const { orgId, userId } = useActor();
  const settings = useOrgSettings();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const requests = useOrgRows(useBuyingStore((s) => s.requests)).filter((r) => r.agentId === a.id);
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases)).filter((p) => p.agentId === a.id);
  const plans = useOrgRows(useFieldStore((s) => s.plans)).filter((p) => p.agentIds.includes(a.id)).sort((x, y) => y.weekStart.localeCompare(x.weekStart));
  const budgets = useOrgRows(useFieldStore((s) => s.budgets)).filter((b) => b.agentId === a.id);
  const commissions = useOrgRows(useFieldStore((s) => s.commissions));
  const reports = useOrgRows(useFieldStore((s) => s.reports)).filter((r) => r.agentId === a.id);
  const activity = useActivityStore((s) => s.activity);
  const user = fl.userOf(a.userId);
  const cashPos = useMemo(() => cashPosition(a.id), [a.id, requests.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const score = useMemo(() => agentScore(a), [a]);
  const points = useMemo(() => fieldPoints(orgId).filter((p) => p.agentId === a.id), [orgId, a.id]);
  const lines = commissions.flatMap((p) => p.lines.filter((l) => l.agentId === a.id).map((l) => ({ p, l })));
  const walletLog = activity.filter((e) => e.entity === 'agent' && e.entityId === a.id && e.key === 'agent.walletChanged');
  const [editing, setEditing] = useState<'wallet' | 'areas' | 'manager' | null>(null);
  const [reporting, setReporting] = useState(false);
  const model = modelFor(orgId, a.agentTypeId);
  const thisWeek = mondayOf(new Date());
  const devices = useSystemStore((s) => s.devices).filter((d) => d.userId === a.userId && d.orgId === orgId).sort((x, y) => (x.status === y.status ? y.lastSeenAt.localeCompare(x.lastSeenAt) : x.status === 'ACTIVE' ? -1 : 1));
  const orgs = usePlatformStore((s) => s.orgs);
  const otherCompanies = useAgentStore((s) => s.agents).filter((x) => x.userId === a.userId && x.orgId !== orgId).map((x) => orgs.find((o) => o.id === x.orgId)?.name).filter(Boolean);
  return (
    <>
      <DetailDrawer open onClose={onClose} title={fl.agentName(a.id)} subtitle={`${fl.agentType(a.agentTypeId)} · ${formatPhone(user?.phone ?? '')}`}
        badges={<><FieldStatus status={a.status} />{agentBlocks(orgId, a.id).flagged && <Badge tone="danger"><Flag className="h-3 w-3" /> {t('field.openReports')}</Badge>}{otherCompanies.length > 0 && <Badge tone="info">{t('field.alsoWorksFor', { companies: otherCompanies.join(', ') })}</Badge>}</>}
        actions={<>
          <Button size="sm" variant="secondary" onClick={() => openMobileWindow(orgId, a.userId)}><Smartphone /> {t('shell.openMobileAs', { name: user?.name ?? '' })}</Button>
          <PermissionGate permission="agentReports.create"><Button size="sm" variant="secondary" onClick={() => setReporting(true)}><Flag /> {t('rep.reportAgent')}</Button></PermissionGate>
          {a.status !== 'INVITED' && <PermissionGate permission="agents.edit"><Button size="sm" variant="ghost" onClick={() => { setAgentStatus(a.id, a.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE', userId ?? 'system'); toast.success(t(a.status === 'ACTIVE' ? 'field.toast.deactivated' : 'field.toast.activated')); }}>{a.status === 'ACTIVE' ? t('field.deactivate') : t('field.activate')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'overview', label: t('field.tab.overview'), content: (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([[t('field.cashHeld'), f.money(cashPos.balance)], [t('field.weekTarget'), `${a.weekTargetPct}%`], [t('field.score'), score ? f.number(score.total, { maximumFractionDigits: 1 }) : '—'], [t('field.carryForward'), f.money(outstandingMinor(a.id))]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[18px] font-semibold text-ink">{v}</div></div>)}
                </div>
                <LandMap ariaLabel={t('field.activityMap')} height={260} points={points.slice(-300).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: KIND_COLOR[p.kind], label: `${t(`field.kind.${p.kind}`)} · ${p.label} · ${f.dateTime(p.at)}` }))} />
                <Facts items={[[t('field.lastSync'), a.lastSyncAt ? f.dateTime(a.lastSyncAt) : '—'], [t('field.appVersion'), a.appVersion || '—'], [t('field.invited'), f.date(a.createdAt)], [t('field.purchases'), f.number(purchases.length)]]} />
              </div>
            ),
          },
          {
            key: 'areas', label: t('field.tab.areas'), content: (
              <div className="space-y-4">
                <div className="flex items-center justify-between"><h4 className="text-[13px] font-semibold text-ink">{t('field.areas')}</h4>{can('agents.edit') && <Button size="sm" variant="ghost" onClick={() => setEditing('areas')}><Pencil /> {t('common.edit')}</Button>}</div>
                <div className="flex flex-wrap gap-1.5">{a.areaNodeIds.map((id) => <Badge key={id} tone="neutral">{nodes.find((n) => n.id === id)?.name ?? id}</Badge>)}{!a.areaNodeIds.length && <span className="text-[13px] text-muted">{'—'}</span>}</div>
                <div className="flex items-center justify-between"><h4 className="text-[13px] font-semibold text-ink">{t('field.reportsTo')}</h4>{can('agents.reassign') && <Button size="sm" variant="ghost" onClick={() => setEditing('manager')}><Pencil /> {t('common.edit')}</Button>}</div>
                <p className="text-[14px] text-ink">{a.managerIds.map((m) => fl.user(m)).join(', ') || '—'}</p>
                <p className="text-[13px] text-muted">{t('field.visibilityIs', { rule: t(`set.field.visibilityName.${settings.agentTypes.find((x) => x.id === a.agentTypeId)?.visibility ?? 'AREAS'}`) })}</p>
                <h4 className="text-[13px] font-semibold text-ink">{t('field.communities')}</h4>
                <p className="text-[13px] text-body">{lk.communities.filter((c) => c.agentIds.includes(a.id)).map((c) => c.name).join(', ') || '—'}</p>
              </div>
            ),
          },
          {
            key: 'wallet', label: t('field.wallet'), content: (
              <div className="space-y-4">
                <Facts items={[[t('field.network'), settings.paymentProviders.find((p) => p.id === a.wallet.providerId)?.name ?? a.wallet.providerId], [t('field.number'), a.wallet.number], [t('field.verifiedName'), a.wallet.verifiedName]]} />
                {can('agents.editWallet') && <Button size="sm" variant="secondary" onClick={() => setEditing('wallet')}><Pencil /> {t('field.editWallet')}</Button>}
                <h4 className="text-[13px] font-semibold text-ink">{t('field.changeLog')}</h4>
                {walletLog.length ? <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{walletLog.map((e) => <li key={e.id} className="px-3 py-2">{`${String(e.params.from)} → ${String(e.params.to)} · ${fl.user(e.actorId)} · ${f.dateTime(e.at)}`}</li>)}</ul> : <p className="text-[13px] text-muted">{t('field.noChanges')}</p>}
              </div>
            ),
          },
          {
            key: 'purchases', label: t('field.tab.purchases'), count: requests.length, content: requests.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{requests.slice(0, 25).map((r) => <li key={r.id}><Link to={`/app/purchase-requests?open=${r.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-canvas"><span className="font-mono text-muted">{r.number}</span><span className="flex-1">{f.date(r.createdAt)}</span><span className="tnum">{f.money(r.total)}</span><Badge tone="neutral">{t(`status.${r.status}`, { defaultValue: r.status })}</Badge></Link></li>)}</ul>
            ) : <TabEmpty>{t('field.noRequests')}</TabEmpty>,
          },
          {
            key: 'cash', label: t('field.tab.cash'), content: (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([[t('field.advances'), cashPos.advanced], [t('field.purchases'), cashPos.spent], [t('field.refunds'), cashPos.refunded], [t('field.balance'), cashPos.balance]] as [string, number][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[16px] font-semibold text-ink">{f.money(v)}</div></div>)}</div>
                <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{cashPos.rows.slice(0, 20).map((r) => <li key={r.id} className="grid grid-cols-5 gap-2 px-3 py-2"><span className="font-mono text-muted">{r.number}</span><span className="tnum text-right">{f.money(r.advanced)}</span><span className="tnum text-right">{f.money(r.spent)}</span><span className="tnum text-right">{f.money(r.refunded)}</span><span className="tnum text-right font-medium">{f.money(r.balance)}</span></li>)}</ul>
              </div>
            ),
          },
          {
            key: 'plans', label: t('field.tab.plans'), count: budgets.length, content: (
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{plans.slice(0, 10).map((p) => { const b = budgets.find((x) => x.planId === p.id); return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2"><Link to={`/app/weekly-plans?open=${p.id}`} className="w-40 text-link">{t('field.weekOf', { date: f.date(p.weekStart, 'd MMM') })}</Link>{p.weekStart === thisWeek && <Badge tone="brand">{t('field.thisWeek')}</Badge>}<span className="flex-1" />{b ? <Link to={`/app/budgets?open=${b.id}`} className="flex items-center gap-2"><span className="font-mono text-muted">{b.number}</span><span className="tnum">{f.money(b.net)}</span><FieldStatus status={budgetStage(b)} /></Link> : <span className="text-muted">{t('field.noBudget')}</span>}</li>
              ); })}</ul>
            ),
          },
          {
            key: 'scores', label: t('field.tab.scores'), content: score && model ? (
              <table className="w-full text-[13px]"><tbody>{model.components.map((c) => { const p = score.parts.find((x) => x.componentId === c.id); return <tr key={c.id} className="border-b border-line"><td className="py-1.5">{fl.activity(c.metric)}</td><td className="tnum py-1.5 text-right">{`${f.number(p?.value ?? 0, { maximumFractionDigits: 0 })} / ${f.number(c.target ?? 0)}`}</td><td className="tnum py-1.5 text-right font-medium">{`${f.number(p?.points ?? 0, { maximumFractionDigits: 1 })} / ${c.weight}`}</td></tr>; })}<tr><td className="py-1.5 font-semibold">{t('field.total')}</td><td /><td className="tnum py-1.5 text-right font-semibold">{f.number(score.total, { maximumFractionDigits: 1 })}</td></tr></tbody></table>
            ) : <TabEmpty>{t('field.noScoreModel')}</TabEmpty>,
          },
          {
            key: 'commissions', label: t('nav.compensation'), count: lines.length, content: lines.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{lines.map(({ p, l }) => <li key={l.id}><Link to={`/app/compensation?open=${p.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-canvas"><span className="flex-1 capitalize">{p.name}</span><span className="tnum">{f.money(l.total)}</span><FieldStatus status={l.paid ? 'PAID' : l.status} /></Link></li>)}</ul>
            ) : <TabEmpty>{t('field.noCommissions')}</TabEmpty>,
          },
          {
            key: 'reports', label: t('field.tab.reports'), count: reports.length, content: reports.length ? (
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{reports.map((r) => <li key={r.id}><Link to={`/app/agent-reports?open=${r.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-canvas"><span className="font-mono text-muted">{r.number}</span><span className="flex-1">{fl.issue(r.categoryId)?.name}</span><FieldStatus status={r.status} /></Link></li>)}</ul>
            ) : <TabEmpty>{t('field.noReports')}</TabEmpty>,
          },
          {
            key: 'devices', label: t('field.tab.devices'), count: devices.length, content: devices.length ? (
              <ul className="space-y-3">
                {devices.map((d) => (
                  <li key={d.id} className="rounded-ctl border border-line p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2"><Smartphone className="h-4 w-4 text-muted" aria-hidden="true" /><span className="font-medium text-ink">{d.model}</span><SysStatus status={d.status} />{d.status === 'ACTIVE' && belowMinimum(orgId, d.appVersion) && <Badge tone="warning">{t('sync.belowMin')}</Badge>}{d.updateRequired && <Badge tone="danger">{t('sync.updateRequired')}</Badge>}</div>
                    <Facts items={[[t('sync.col.os'), `${d.os === 'IOS' ? 'iOS' : 'Android'} ${d.osVersion}`], [t('field.appVersion'), d.appVersion], [t('sync.col.push'), t(`sync.push.${d.push}`)], [t('sync.col.lastSeen'), f.dateTime(d.lastSeenAt)]]} />
                    <div className="mt-3"><DeviceActions d={d} /></div>
                  </li>
                ))}
                <li><Link to="/app/sync?view=devices" className="text-[13px] font-medium text-brand hover:underline">{t('field.allDevices')}</Link></li>
              </ul>
            ) : <TabEmpty>{t('field.noDevice')}</TabEmpty>,
          },
          {
            key: 'gps', label: t('field.tab.gps'), count: points.length, content: points.length ? (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-ctl border border-line text-[13px]">{[...points].reverse().slice(0, 80).map((p) => <li key={p.id} className="flex items-center gap-3 px-3 py-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[p.kind] }} aria-hidden /><span className="w-24">{t(`field.kind.${p.kind}`)}</span><span className="flex-1 text-body">{`${p.label} · ${lk.community(p.communityId)}`}</span>{p.outOfArea && <Badge tone="warning">{t('field.outOfArea', { km: p.distanceKm ?? '' })}</Badge>}<span className="text-muted">{f.dateTime(p.at)}</span></li>)}</ul>
            ) : <TabEmpty>{t('field.noGps')}</TabEmpty>,
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="agent" entityId={a.id} /> },
        ]} />
      {editing === 'wallet' && <WalletDialog a={a} onClose={() => setEditing(null)} />}
      {editing === 'areas' && <AreasDialog a={a} onClose={() => setEditing(null)} />}
      {editing === 'manager' && <ManagerDialog a={a} onClose={() => setEditing(null)} />}
      {reporting && <NewReportDialog agentId={a.id} onClose={() => setReporting(false)} />}
    </>
  );
}

function WalletDialog({ a, onClose }: { a: Agent; onClose: () => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const settings = useOrgSettings();
  const [number, setNumber] = useState(a.wallet.number);
  const [name, setName] = useState(a.wallet.verifiedName);
  const [state, setState] = useState<'idle' | 'checking' | 'match' | 'mismatch'>('idle');
  const providerId = detectProvider(orgId, number)?.id ?? a.wallet.providerId;
  const check = async () => { setState('checking'); const r = await lookupPayee(number, name); setName(r.name || name); setState(r.match ? 'match' : 'mismatch'); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.editWallet')}</DialogTitle><DialogDescription>{t('field.walletHint')}</DialogDescription></DialogHeader>
        <Field label={t('field.number')} helper={settings.paymentProviders.find((p) => p.id === providerId)?.name}><Input value={number} inputMode="tel" onChange={(e) => { setNumber(e.target.value); setState('idle'); }} aria-label={t('field.number')} /></Field>
        <Field label={t('field.verifiedName')}><Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('field.verifiedName')} /></Field>
        <div className="flex items-center gap-2 text-[13px]"><Button size="sm" variant="secondary" disabled={state === 'checking'} onClick={() => void check()}>{state === 'checking' ? <Loader2 className="animate-spin" /> : null}{t('field.lookup')}</Button>{state === 'match' && <Badge tone="success">{t('field.nameMatches')}</Badge>}{state === 'mismatch' && <Badge tone="warning">{t('field.nameDiffers')}</Badge>}</div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={state !== 'match' && state !== 'mismatch'} onClick={() => { updateWallet(a.id, { providerId, number, verifiedName: name }, userId ?? 'system'); toast.success(t('field.toast.wallet')); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AreasDialog({ a, onClose }: { a: Agent; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const [ids, setIds] = useState(a.areaNodeIds);
  const [q, setQ] = useState('');
  const shown = nodes.filter((n) => !q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('field.areas')}</DialogTitle><DialogDescription>{t('field.areasHint')}</DialogDescription></DialogHeader>
        <Input placeholder={t('field.searchAreas')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('field.searchAreas')} />
        <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">{shown.map((n) => <button key={n.id} type="button" aria-pressed={ids.includes(n.id)} onClick={() => setIds(ids.includes(n.id) ? ids.filter((x) => x !== n.id) : [...ids, n.id])} className={cn('rounded-chip border px-3 py-1 text-[13px]', ids.includes(n.id) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-muted')}>{n.name}</button>)}</div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!ids.length} onClick={() => { setAgentAreas(a.id, ids, userId ?? 'system'); toast.success(t('field.toast.saved')); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagerDialog({ a, onClose }: { a: Agent; onClose: () => void }) {
  const { t } = useT();
  const fl = useFieldLookups();
  const { userId } = useActor();
  const [ids, setIds] = useState(a.managerIds);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.reportsTo')}</DialogTitle><DialogDescription>{t('field.managersHint')}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-1.5">{fl.supervisors.map((m) => <button key={m} type="button" aria-pressed={ids.includes(m)} onClick={() => setIds(ids.includes(m) ? ids.filter((x) => x !== m) : [...ids, m])} className={cn('rounded-chip border px-3 py-1 text-[13px]', ids.includes(m) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-muted')}>{fl.user(m)}</button>)}</div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!ids.length} onClick={() => { try { reassignAgent(a.id, ids, userId ?? 'system'); toast.success(t('field.toast.reassigned')); onClose(); } catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); } }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const warehouses = useOrgRows(useWarehouseStore((s) => s.warehouses));
  const users = useAccessStore((s) => s.users);
  const [v, setV] = useState({ name: '', phone: '', agentTypeId: settings.agentTypes[0]?.id ?? '', areaNodeIds: [] as string[], managerIds: userId && fl.supervisors.includes(userId) ? [userId] : [] as string[], warehouseId: '', walletNumber: '', walletName: '', language: (settings.terminology ? (orgId.includes('kakao') ? 'fr' : 'en') : 'en') as 'en' | 'fr' });
  const [q, setQ] = useState('');
  const type = settings.agentTypes.find((x) => x.id === v.agentTypeId);
  const input = { orgId, name: v.name, phone: v.phone, agentTypeId: v.agentTypeId, areaNodeIds: v.areaNodeIds, managerIds: v.managerIds, warehouseId: v.warehouseId || undefined, wallet: { providerId: detectProvider(orgId, v.walletNumber || v.phone)?.id ?? '', number: v.walletNumber || v.phone, verifiedName: v.walletName || v.name }, language: v.language, actorId: userId ?? 'system' };
  const problems = inviteProblems(input);
  void users;
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const shownNodes = nodes.filter((n) => !q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('field.inviteAgent')}</SheetTitle><p className="mt-1 text-[14px] text-muted">{t('field.inviteHint')}</p></div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('col.name')}><Input value={v.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('col.name')} /></Field>
            <Field label={t('col.phone')} error={v.phone && problems.includes('phone') ? t('field.err.phone') : v.phone && problems.includes('phoneTaken') ? t('field.err.phoneTaken') : undefined}><Input value={v.phone} inputMode="tel" placeholder={orgId.includes('kakao') ? '07 07 00 00 00' : '024 000 0000'} onChange={(e) => set({ phone: e.target.value })} aria-label={t('col.phone')} /></Field>
            <Field label={t('field.agentType')}><select value={v.agentTypeId} onChange={(e) => set({ agentTypeId: e.target.value })} aria-label={t('field.agentType')} className={selectCls}>{settings.agentTypes.map((x) => <option key={x.id} value={x.id}>{fl.agentType(x.id)}</option>)}</select></Field>
            <Field label={t('field.language')}><select value={v.language} onChange={(e) => set({ language: e.target.value as 'en' | 'fr' })} aria-label={t('field.language')} className={selectCls}><option value="en">{'English'}</option><option value="fr">{'Français'}</option></select></Field>
          </div>
          <p className="text-[13px] text-muted">{t('field.requiredForType', { fields: (type?.requiredFields?.length ? type.requiredFields : ['areas', 'manager']).map((x) => t(`field.req.${x}`, { defaultValue: x })).join(', ') })}</p>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-label">{t('field.areas')}</div>
            <Input placeholder={t('field.searchAreas')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('field.searchAreas')} className="mb-2" />
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">{shownNodes.map((n) => <button key={n.id} type="button" aria-pressed={v.areaNodeIds.includes(n.id)} onClick={() => set({ areaNodeIds: v.areaNodeIds.includes(n.id) ? v.areaNodeIds.filter((x) => x !== n.id) : [...v.areaNodeIds, n.id] })} className={cn('rounded-chip border px-3 py-1 text-[13px]', v.areaNodeIds.includes(n.id) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-muted')}>{n.name}</button>)}</div>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-label">{t('field.reportsTo')}</div>
            <div className="flex flex-wrap gap-1.5">{fl.supervisors.map((m) => <button key={m} type="button" aria-pressed={v.managerIds.includes(m)} onClick={() => set({ managerIds: v.managerIds.includes(m) ? v.managerIds.filter((x) => x !== m) : [...v.managerIds, m] })} className={cn('rounded-chip border px-3 py-1 text-[13px]', v.managerIds.includes(m) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-muted')}>{fl.user(m)}</button>)}</div>
          </div>
          {(type?.requiredFields?.includes('warehouse') || type?.mobileTiles.includes('warehouse')) && <Field label={t('field.warehouse')}><select value={v.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })} aria-label={t('field.warehouse')} className={selectCls}><option value="">{'—'}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('field.walletNumber')} helper={t('field.walletSame')}><Input value={v.walletNumber} inputMode="tel" onChange={(e) => set({ walletNumber: e.target.value })} aria-label={t('field.walletNumber')} /></Field>
            <Field label={t('field.verifiedName')}><Input value={v.walletName} placeholder={v.name} onChange={(e) => set({ walletName: e.target.value })} aria-label={t('field.verifiedName')} /></Field>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
          <span className="text-[13px] text-muted">{problems.length ? t('field.missing', { fields: problems.map((p) => t(`field.req.${p}`, { defaultValue: p })).join(', ') }) : t('field.readyToInvite')}</span>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
            <Button disabled={problems.length > 0} onClick={() => { const a = inviteAgent(input); toast.success(t('field.toast.invited', { name: v.name }), { description: t('field.toast.smsSent') }); onClose(a.id); }}>{t('field.sendInvite')}</Button></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const useAgents = () => useAgentStore((s) => s.agents);
