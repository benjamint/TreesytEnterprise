import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Gavel, Plus, Repeat, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { CarryForward } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field, TextAreaField } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { addDays, approveWaiver, createCarryForward, mondayOf, penaltyRunFor, postPenalties, previewPenalties, requestWaiver } from '@/services/fieldService';
import { toMinor } from '@/engines/money';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useCan, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed } from '@/web/features/people/shared';
import { AgentName, FieldStatus, PctCell, WeekPicker, selectCls, useFieldLookups } from './shared';

/** Carry-forwards and penalties (PRD J5): list with applications, performance penalty run, waive / appeal, manual entries. */
export function CarryForwardsPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const [params] = useSearchParams();
  const rows = useOrgRows(useFieldStore((s) => s.carryForwards));
  const budgets = useFieldStore((s) => s.budgets);
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [agent, setAgent] = useState(params.get('agent') ?? '');
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState(false);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((c) => (!status || c.status === status) && (!type || c.type === type) && (!agent || c.agentId === agent) && (!query || [fl.agentName(c.agentId), c.reason].some((x) => x.toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<CarryForward, unknown>[]>(() => [
    { id: 'agent', header: t('col.agent'), accessorFn: (c) => fl.agentName(c.agentId), cell: (c) => <AgentName id={c.row.original.agentId} /> },
    { id: 'type', header: t('field.type'), accessorKey: 'type', cell: (c) => t(`field.cfType.${c.getValue() as string}`) },
    { id: 'source', header: t('field.source'), accessorFn: (c) => budgets.find((b) => b.id === c.sourceBudgetId)?.number ?? (c.penalty ? t('field.weekOf', { date: f.date(c.penalty.weekStart, 'd MMM') }) : '—') },
    { id: 'reason', header: t('field.reason'), accessorKey: 'reason' },
    { id: 'amount', header: t('field.amount'), accessorFn: (c) => c.amount.amountMinor, cell: (c) => <span className="tnum">{f.money(c.row.original.amount)}</span> },
    { id: 'applied', header: t('field.applied'), accessorFn: (c) => c.applications.reduce((s, a) => s + a.amountMinor, 0), cell: (c) => <span className="tnum">{f.money(c.getValue() as number)}</span> },
    { id: 'remaining', header: t('field.remaining'), accessorKey: 'remainingMinor', cell: (c) => <span className="tnum font-medium text-ink">{f.money(c.getValue() as number)}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <span className="flex items-center gap-1.5"><FieldStatus status={c.getValue() as string} />{c.row.original.waiver && !c.row.original.waiver.approvedBy && <Badge tone="warning">{t('field.waiverRequested')}</Badge>}</span> },
  ], [t, f, fl, budgets]);
  const current = rows.find((c) => c.id === openId);
  const open$ = rows.filter((c) => c.status === 'PENDING' || c.status === 'PARTIAL');
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.carryForwards')} description={t('pages.carryForwards')}
        actions={<PermissionGate permission="carryForwards.waive"><Button variant="secondary" onClick={() => setManual(true)}><Plus /> {t('field.manualCf')}</Button></PermissionGate>}
        primary={<PermissionGate permission="carryForwards.runPenalties"><Button onClick={() => setRunning(true)}><Gavel /> {t('field.runPenalties')}</Button></PermissionGate>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('field.outstanding')} value={f.money(open$.reduce((s, c) => s + c.remainingMinor, 0))} hint={t('field.agentsN', { count: new Set(open$.map((c) => c.agentId)).size })} icon={Repeat} />
        <StatCard label={t('field.cfType.UNDER_SPEND')} value={f.number(rows.filter((c) => c.type === 'UNDER_SPEND').length)} onClick={() => setType('UNDER_SPEND')} />
        <StatCard label={t('field.cfType.PENALTY')} value={f.number(rows.filter((c) => c.type === 'PENALTY').length)} onClick={() => setType('PENALTY')} />
        <StatCard label={t('field.waiversPending')} value={f.number(rows.filter((c) => c.waiver && !c.waiver.approvedBy).length)} icon={ShieldCheck} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchCf')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['PENDING', 'PARTIAL', 'APPLIED', 'WAIVED'] as const).map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((c) => c.status === s).length }))]}
        filters={[
          { key: 'type', label: t('field.type'), value: type, onChange: setType, options: (['UNDER_SPEND', 'PENALTY', 'MANUAL'] as const).map((x) => ({ value: x, label: t(`field.cfType.${x}`) })) },
          { key: 'agent', label: t('col.agent'), value: agent, onChange: setAgent, options: [...new Set(rows.map((c) => c.agentId))].map((a) => ({ value: a, label: fl.agentName(a) })) },
        ]}
        onClear={() => { setQ(''); setStatus(''); setType(''); setAgent(''); }} />
      <DataTable columns={columns} data={shown} onRowClick={(c) => open(c.id)} activeId={openId} getRowId={(c) => c.id} empty={t('field.noCf')}
        exportCsv={{ fileName: 'carry-forwards.csv', columns: [{ header: t('col.agent'), value: (c) => fl.agentName(c.agentId) }, { header: t('field.type'), value: (c) => c.type }, { header: t('field.amount'), value: (c) => c.amount.amountMinor / 100 }, { header: t('field.remaining'), value: (c) => c.remainingMinor / 100 }, { header: t('col.status'), value: (c) => c.status }] }} />
      {current && <CfDrawer key={current.id} c={current} onClose={close} />}
      {running && <PenaltyRunDialog onClose={() => setRunning(false)} />}
      {manual && <ManualDialog onClose={() => setManual(false)} />}
    </>
  );
}

function CfDrawer({ c, onClose }: { c: CarryForward; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const can = useCan();
  const { userId } = useActor();
  const budgets = useFieldStore((s) => s.budgets);
  const [waiving, setWaiving] = useState(false);
  const openWaiver = c.waiver && !c.waiver.approvedBy;
  return (
    <>
      <DetailDrawer open onClose={onClose} title={fl.agentName(c.agentId)} subtitle={`${t(`field.cfType.${c.type}`)} · ${f.money(c.amount)}`} badges={<FieldStatus status={c.status} />}
        actions={<>
          {(c.status === 'PENDING' || c.status === 'PARTIAL') && !c.waiver && <Button size="sm" variant="secondary" onClick={() => setWaiving(true)}>{t('field.requestWaiver')}</Button>}
          {openWaiver && can('carryForwards.waive') && <Button size="sm" disabled={c.waiver!.requestedBy === userId} title={c.waiver!.requestedBy === userId ? t('field.err.sameUser') : undefined} onClick={() => { approveWaiver(c.id, userId ?? 'system'); toast.success(t('field.toast.waived')); }}>{t('field.approveWaiver')}</Button>}
        </>}
        tabs={[
          {
            key: 'details', label: t('field.tab.details'), content: (
              <div className="space-y-4">
                <Facts items={[
                  [t('field.reason'), c.reason], [t('field.created'), `${fl.user(c.createdBy)} · ${f.dateTime(c.createdAt)}`],
                  [t('field.amount'), f.money(c.amount)], [t('field.remaining'), f.money({ amountMinor: c.remainingMinor, currency: c.amount.currency })],
                  ...(c.penalty ? [[t('field.achievement'), `${c.penalty.achievementPct}% → ${c.penalty.penaltyPct}% × ${f.money({ amountMinor: c.penalty.baseMinor, currency: c.amount.currency })}`] as [string, string]] : []),
                  ...(c.waiver ? [[t('field.waiver'), `${c.waiver.reason} · ${fl.user(c.waiver.requestedBy)}${c.waiver.approvedBy ? ` → ${t('field.approvedBy', { name: fl.user(c.waiver.approvedBy) })}` : ''}`] as [string, string]] : []),
                ]} />
                <h4 className="text-[13px] font-semibold text-ink">{t('field.applications')}</h4>
                {c.applications.length ? <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{c.applications.map((a, i) => <li key={i} className="flex justify-between px-3 py-2"><span>{budgets.find((b) => b.id === a.budgetId)?.number ?? t('field.earlierBudget')}<span className="text-muted">{` · ${f.date(a.at)}`}</span></span><span className="tnum">{`− ${f.money({ amountMinor: a.amountMinor, currency: c.amount.currency })}`}</span></li>)}</ul> : <p className="text-[13px] text-muted">{t('field.notAppliedYet')}</p>}
              </div>
            ),
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="carryForward" entityId={c.id} /> },
        ]} />
      {waiving && <WaiverDialog c={c} onClose={() => setWaiving(false)} />}
    </>
  );
}

function WaiverDialog({ c, onClose }: { c: CarryForward; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.requestWaiver')}</DialogTitle><DialogDescription>{t('field.waiverHint')}</DialogDescription></DialogHeader>
        <TextAreaField label={t('field.reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!reason.trim()} onClick={() => { requestWaiver(c.id, reason.trim(), userId ?? 'system'); toast.success(t('field.toast.waiverRequested')); onClose(); }}>{t('field.send')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Performance penalty run: preview every agent's achievement and the band applied, then post. */
function PenaltyRunDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const [week, setWeek] = useState(addDays(mondayOf(new Date()), -7));
  const lines = useMemo(() => previewPenalties(orgId, week), [orgId, week]);
  const done = penaltyRunFor(orgId, week);
  const total = lines.reduce((s, l) => s + l.amountMinor, 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t('field.runPenalties')}</DialogTitle><DialogDescription>{t('field.penaltyHint', { bands: settings.fieldTeam.penaltyBands.map((b) => `${b.fromPct}–${Math.min(100, b.toPct)}% → ${b.penaltyPct}%`).join(' · ') })}</DialogDescription></DialogHeader>
        <WeekPicker value={week} onChange={setWeek} />
        {done && <p className="rounded-ctl border border-info/40 bg-info/5 px-3 py-2 text-[13px]" role="status">{t('field.alreadyRun', { date: f.dateTime(done.at), name: fl.user(done.by) })}</p>}
        <div className="max-h-[50vh] overflow-y-auto rounded-ctl border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-canvas"><tr className="text-left text-[12px] text-label"><th className="px-3 py-2">{t('col.agent')}</th><th className="px-3 py-2 text-center">{t('field.achievement')}</th><th className="px-3 py-2 text-right">{t('field.base')}</th><th className="px-3 py-2 text-right">{t('field.penalty')}</th><th className="px-3 py-2 text-right">{t('field.amount')}</th></tr></thead>
            <tbody>{(done?.lines ?? lines).map((l) => (
              <tr key={l.agentId} className="border-t border-line"><td className="px-3 py-1.5"><AgentName id={l.agentId} /></td><td className="px-3 py-1.5 text-center"><PctCell pct={l.achievementPct} /></td><td className="tnum px-3 py-1.5 text-right">{f.money(l.baseMinor)}</td><td className="tnum px-3 py-1.5 text-right">{`${l.penaltyPct}%`}</td><td className="tnum px-3 py-1.5 text-right font-medium">{l.amountMinor ? f.money(l.amountMinor) : '—'}</td></tr>
            ))}</tbody>
          </table>
          {!lines.length && !done && <p className="px-3 py-6 text-center text-[13px] text-muted">{t('field.noPlansWeek')}</p>}
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-[13px] text-muted">{t('field.penaltyTotal', { amount: f.money(total), count: lines.filter((l) => l.amountMinor > 0).length })}</span>
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
          <Button disabled={!!done || !lines.length} onClick={() => { const r = postPenalties(orgId, week, userId ?? 'system'); toast.success(t('field.toast.penalties', { count: r.lines.filter((l) => l.carryForwardId).length })); onClose(); }}>{t('field.postRun')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const fl = useFieldLookups();
  const org = useCurrentOrg();
  const { orgId, userId } = useActor();
  const [agentId, setAgentId] = useState(fl.agents[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('field.manualCf')}</DialogTitle><DialogDescription>{t('field.manualCfHint')}</DialogDescription></DialogHeader>
        <Field label={t('col.agent')}><select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label={t('col.agent')} className={selectCls}>{fl.agents.map((a) => <option key={a.id} value={a.id}>{fl.agentName(a.id)}</option>)}</select></Field>
        <Field label={t('field.amount')}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('field.amount')} /></Field>
        <TextAreaField label={t('field.reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!(Number(amount) > 0) || !reason.trim()} onClick={() => { createCarryForward({ orgId, agentId, type: 'MANUAL', reason: reason.trim(), amountMinor: toMinor(Number(amount), org.currency), actorId: userId ?? 'system' }); toast.success(t('field.toast.cfCreated')); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
