import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Gift, Play, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { AllowanceRun } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { agentBlocks } from '@/services/fieldService';
import { approveAllowanceRun, createAllowanceRun, previewAllowance } from '@/services/teamService';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { mono } from '@/web/features/buying/common';
import { PayDialog } from '@/web/features/payments/PayDialog';
import { AgentName, FieldStatus, PctCell, selectCls, useFieldLookups } from './shared';

/** Monthly allowances (PRD J7): run for a period with an eligibility preview, approve, pay in bulk; frozen once paid. */
export function AllowancesPage() {
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const rows = useOrgRows(useFieldStore((s) => s.allowanceRuns));
  const [openId, open, close] = useDrawerParam();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [running, setRunning] = useState(false);
  const typeName = (id: string) => settings.fieldTeam.allowanceTypes.find((x) => x.id === id)?.name ?? id;
  const shown = rows.filter((r) => (!status || r.status === status) && (!q.trim() || `${r.number} ${typeName(r.typeId)}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.period.from.localeCompare(a.period.from));
  const total = (r: AllowanceRun) => r.lines.filter((l) => l.status !== 'NOT_ELIGIBLE').reduce((s, l) => s + l.amountMinor, 0);
  const columns = useMemo<ColumnDef<AllowanceRun, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'type', header: t('field.allowanceType'), accessorFn: (r) => typeName(r.typeId) },
    { id: 'period', header: t('field.period'), accessorFn: (r) => r.period.from, cell: (c) => `${f.date(c.row.original.period.from, 'd MMM')} – ${f.date(c.row.original.period.to, 'd MMM yyyy')}` },
    { id: 'eligible', header: t('field.eligible'), accessorFn: (r) => r.lines.filter((l) => l.status !== 'NOT_ELIGIBLE').length, cell: (c) => `${c.getValue() as number} / ${c.row.original.lines.length}` },
    { id: 'total', header: t('field.total'), accessorFn: total, cell: (c) => <span className="tnum">{f.money({ amountMinor: c.getValue() as number, currency: c.row.original.currency })}</span> },
    { id: 'paid', header: t('field.paidLines'), accessorFn: (r) => r.lines.filter((l) => l.status === 'PAID').length },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <FieldStatus status={c.getValue() as string} /> },
  ], [t, f, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = rows.find((r) => r.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.allowances')} description={t('pages.allowances')}
        primary={<PermissionGate permission="allowances.run"><Button onClick={() => setRunning(true)} disabled={!settings.fieldTeam.allowanceTypes.length}><Play /> {t('field.runAllowance')}</Button></PermissionGate>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('field.runs')} value={f.number(rows.length)} icon={Gift} />
        <StatCard label={t('field.waitingApproval')} value={f.number(rows.filter((r) => r.status === 'PREVIEW').length)} onClick={() => setStatus('PREVIEW')} />
        <StatCard label={t('field.paidThisYear')} value={f.money(rows.filter((r) => r.period.from.slice(0, 4) === new Date().toISOString().slice(0, 4)).reduce((s, r) => s + r.lines.filter((l) => l.status === 'PAID').reduce((a, l) => a + l.amountMinor, 0), 0))} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('field.searchRuns')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['PREVIEW', 'APPROVED', 'PAID'] as const).map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((r) => r.status === s).length }))]} />
      <DataTable columns={columns} data={shown} onRowClick={(r) => open(r.id)} activeId={openId} getRowId={(r) => r.id} empty={t('field.noRuns')} />
      {current && <RunDrawer key={current.id} r={current} typeName={typeName(current.typeId)} onClose={close} />}
      {running && <RunDialog onClose={(id) => { setRunning(false); if (id) open(id); }} />}
    </>
  );
}

function RunDrawer({ r, typeName, onClose }: { r: AllowanceRun; typeName: string; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const can = useCan();
  const { userId } = useActor();
  useFieldStore((s) => s.reports);
  const [paying, setPaying] = useState(false);
  const payable = r.lines.filter((l) => (l.status === 'ELIGIBLE' || l.status === 'FAILED') && l.amountMinor > 0);
  const blocked = payable.filter((l) => agentBlocks(r.orgId, l.agentId).payouts);
  const toPay = payable.filter((l) => !blocked.includes(l));
  return (
    <>
      <DetailDrawer open onClose={onClose} title={`${typeName} · ${f.date(r.period.from, 'MMMM yyyy')}`} subtitle={r.number} badges={<FieldStatus status={r.status} />}
        actions={<>
          {r.status === 'PREVIEW' && can('allowances.approve') && <Button size="sm" disabled={r.createdBy === userId} title={r.createdBy === userId ? t('field.err.sameUser') : undefined} onClick={() => { approveAllowanceRun(r.id, userId ?? 'system'); toast.success(t('field.toast.approved')); }}><Check /> {t('field.approve')}</Button>}
          {r.status === 'APPROVED' && toPay.length > 0 && <PermissionGate permission="allowances.pay"><Button size="sm" onClick={() => setPaying(true)}><Send /> {t('field.payN', { count: toPay.length })}</Button></PermissionGate>}
        </>}
        tabs={[{
          key: 'lines', label: t('field.lines'), count: r.lines.length, content: (
            <div className="space-y-3">
              <Facts items={[[t('field.period'), `${f.date(r.period.from)} – ${f.date(r.period.to)}`], [t('field.total'), f.money({ amountMinor: r.lines.filter((l) => l.status !== 'NOT_ELIGIBLE').reduce((s, l) => s + l.amountMinor, 0), currency: r.currency })], ...(r.approvedBy ? [[t('field.approvedBy', { name: '' }), `${fl.user(r.approvedBy)} · ${f.dateTime(r.approvedAt!)}`] as [string, string]] : [])]} />
              {blocked.length > 0 && <p className="rounded-ctl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px]" role="alert">{t('field.blockedSkipped', { count: blocked.length })}</p>}
              {r.status === 'PAID' && <p className="text-[13px] text-muted">{t('field.frozen')}</p>}
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{r.lines.map((l) => (
                <li key={l.agentId} className="flex items-center gap-3 px-3 py-2"><span className="flex-1"><AgentName id={l.agentId} /></span><PctCell pct={l.achievementPct} /><span className="tnum w-28 text-right">{l.amountMinor ? f.money({ amountMinor: l.amountMinor, currency: r.currency }) : '—'}</span><FieldStatus status={l.status} /></li>
              ))}</ul>
            </div>
          ),
        }]} />
      {paying && <PayDialog request={{ type: 'MONTHLY_ALLOWANCE', payableId: r.id, title: t('field.payAllowanceTitle', { number: r.number }), payees: toPay.map((l) => { const a = fl.agent(l.agentId)!; return { name: a.wallet.verifiedName, number: a.wallet.number, providerId: a.wallet.providerId, amount: { amountMinor: l.amountMinor, currency: r.currency }, payableId: `${r.id}#${l.agentId}`, label: fl.agentName(l.agentId) }; }) }} onClose={() => setPaying(false)} />}
    </>
  );
}

function RunDialog({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const types = settings.fieldTeam.allowanceTypes;
  const [typeId, setTypeId] = useState(types.find((x) => x.frequency === 'MONTHLY')?.id ?? types[0]?.id ?? '');
  const d = new Date();
  const [month, setMonth] = useState(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7));
  const from = `${month}-01`;
  const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const lines = useMemo(() => (typeId ? previewAllowance(orgId, typeId, from, to) : []), [orgId, typeId, from, to]);
  const type = types.find((x) => x.id === typeId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('field.runAllowance')}</DialogTitle><DialogDescription>{type ? t('field.allowanceHint', { threshold: type.thresholdPct, amount: f.money(type.amountMinor) }) : ''}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('field.allowanceType')}><select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label={t('field.allowanceType')} className={selectCls}>{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label={t('field.month')}><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('field.month')} /></Field>
        </div>
        <div className="max-h-[45vh] overflow-y-auto rounded-ctl border border-line">
          <ul className="divide-y divide-line text-[13px]">{lines.map((l) => <li key={l.agentId} className="flex items-center gap-3 px-3 py-2"><span className="flex-1"><AgentName id={l.agentId} /></span><PctCell pct={l.achievementPct} /><span className="tnum w-28 text-right">{l.amountMinor ? f.money(l.amountMinor) : '—'}</span><FieldStatus status={l.status} /></li>)}</ul>
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-[13px] text-muted">{t('field.eligibleOf', { n: lines.filter((l) => l.status === 'ELIGIBLE').length, total: lines.length, amount: f.money(lines.reduce((s, l) => s + l.amountMinor, 0)) })}</span>
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button disabled={!lines.length} onClick={() => { try { const r = createAllowanceRun(orgId, typeId, from, to, userId ?? 'system'); toast.success(t('field.toast.runCreated', { number: r.number })); onClose(r.id); } catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); } }}>{t('field.createRun')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
