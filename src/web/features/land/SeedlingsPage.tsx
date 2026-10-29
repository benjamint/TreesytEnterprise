import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, PackagePlus, Send, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { SeedlingAllocation, SeedlingLot } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { Field } from '@/components/shared/Field';
import { FilterBar, TabEmpty } from '@/components/shared/ListKit';
import { answerTransfer, assignToAgent, assignToFarmer, farmerSeedlings, lotAvailable, receiveLot, seedlingStock, transferToCompany } from '@/services/landService';
import { cn } from '@/lib/utils';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLandStore } from '@/stores/landStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { useLandLookups, usePageTab } from './shared';

const TABS = ['stock', 'sourcing', 'allocations', 'transfers'] as const;
const today = () => new Date().toISOString().slice(0, 10);

/** Seedlings (PRD I2): stock by species, sourcing with generated codes, assignment and allocations. */
export function SeedlingsPage() {
  const { t } = useT();
  const { orgId } = useActor();
  const [tab, setTab] = usePageTab(TABS, 'stock');
  const incoming = useLandStore((s) => s.allocations).filter((a) => a.kind === 'TO_COMPANY' && a.toOrgId === orgId && a.consent?.status === 'PENDING');
  const [receiving, setReceiving] = useState(false);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.trees')} title={t('nav.seedlings')} description={t('pages.seedlings')}
        primary={<PermissionGate permission="seedlings.create"><Button onClick={() => setReceiving(true)}><PackagePlus /> {t('land.receiveLot')}</Button></PermissionGate>} />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>{t(`land.sTab.${k}`)}{k === 'transfers' && incoming.length > 0 && <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[11px] text-white dark:text-canvas">{incoming.length}</span>}</button>)}
      </div>
      {tab === 'stock' && <StockTab />}
      {tab === 'sourcing' && <SourcingTab />}
      {tab === 'allocations' && <AllocationsTab />}
      {tab === 'transfers' && <TransfersTab />}
      {receiving && <ReceiveSheet onClose={() => { setReceiving(false); setTab('sourcing'); }} />}
    </>
  );
}

function StockTab() {
  const { t } = useT();
  const f = useFormat();
  const { orgId } = useActor();
  const ll = useLandLookups();
  const lots = useLandStore((s) => s.lots);
  const allocations = useLandStore((s) => s.allocations);
  const trees = useLandStore((s) => s.trees);
  const nurseries = useLandStore((s) => s.nurseries);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => seedlingStock(orgId), [orgId, lots, allocations, trees, nurseries]);
  const total = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const cols = ['sourced', 'inNursery', 'withAgents', 'allocated', 'planted', 'alive', 'unassigned'] as const;
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-soft">
      <table className="w-full min-w-[760px] text-[14px]">
        <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label"><th className="px-4 py-3 font-semibold">{t('land.species')}</th>{cols.map((c) => <th key={c} className="px-4 py-3 text-right font-semibold">{t(`land.stock.${c}`)}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.speciesId} className="border-b border-line"><td className="px-4 py-2.5 font-medium text-ink">{ll.speciesName(r.speciesId)}</td>{cols.map((c) => <td key={c} className={cn('tnum px-4 py-2.5 text-right', c === 'unassigned' && r.unassigned > 0 && 'font-semibold text-ink')}>{f.number(r[c])}</td>)}</tr>)}
          <tr className="bg-canvas font-semibold"><td className="px-4 py-2.5 text-ink">{t('col.total')}</td>{cols.map((c) => <td key={c} className="tnum px-4 py-2.5 text-right text-ink">{f.number(total(c))}</td>)}</tr>
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-[13px] text-muted">{t('land.stockHint')}</p>
    </div>
  );
}

function SourcingTab() {
  const { t } = useT();
  const f = useFormat();
  const ll = useLandLookups();
  const rows = useOrgRows(useLandStore((s) => s.lots));
  const nurseries = useOrgRows(useLandStore((s) => s.nurseries));
  const [assign, setAssign] = useState<SeedlingLot | null>(null);
  const allocations = useLandStore((s) => s.allocations);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const free = useMemo(() => new Map(rows.map((l) => [l.id, lotAvailable(l).length])), [rows, allocations]);
  const columns = useMemo<ColumnDef<SeedlingLot, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'source', header: t('land.source'), accessorFn: (l) => (l.source === 'NURSERY' ? nurseries.find((n) => n.id === l.nurseryId)?.name ?? '—' : l.supplierName ?? '—'), cell: (c) => <span><Badge tone={c.row.original.source === 'NURSERY' ? 'teal' : 'info'}>{t(`land.lotSource.${c.row.original.source}`)}</Badge> <span className="ml-1">{c.getValue() as string}</span></span> },
    { id: 'species', header: t('land.species'), accessorFn: (l) => ll.speciesName(l.speciesId) },
    { id: 'qty', header: t('col.quantity'), accessorKey: 'quantity', cell: (c) => f.number(c.getValue() as number) },
    { id: 'codes', header: t('land.codes'), accessorFn: (l) => `${l.codeFrom} – ${l.codeTo}`, cell: (c) => <span className="whitespace-nowrap font-mono text-[12px]">{c.getValue() as string}</span> },
    { id: 'free', header: t('land.unassigned'), accessorFn: (l) => free.get(l.id) ?? 0, cell: (c) => f.number(c.getValue() as number) },
    { id: 'cost', header: t('land.cost'), accessorFn: (l) => l.cost?.amountMinor ?? 0, cell: (c) => (c.row.original.cost ? f.money(c.row.original.cost) : '—') },
    { id: 'date', header: t('col.date'), accessorKey: 'receivedAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'act', header: '', cell: (c) => (free.get(c.row.original.id) ? <PermissionGate permission="seedlings.assign"><Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); setAssign(c.row.original); }}><Send /> {t('land.assign')}</Button></PermissionGate> : null) },
  ], [t, f, ll, nurseries, free]);
  return (
    <>
      <DataTable columns={columns} data={[...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} getRowId={(l) => l.id} empty={t('land.noLots')} />
      {assign && <AssignDialog lot={assign} onClose={() => setAssign(null)} />}
    </>
  );
}

function AllocationsTab() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const rows = useOrgRows(useLandStore((s) => s.allocations));
  const orgs = usePlatformStore((s) => s.orgs);
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('');
  const [kind, setKind] = useState('');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((a) => (!agent || a.agentId === agent) && (!kind || a.kind === kind) && (!query || ll.farmerName(a.farmerId).toLowerCase().includes(query) || a.codes.some((c) => c.toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<SeedlingAllocation, unknown>[]>(() => [
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'kind', header: t('col.type'), accessorKey: 'kind', cell: (c) => <Badge tone={c.getValue() === 'TO_FARMER' ? 'success' : c.getValue() === 'TO_AGENT' ? 'info' : 'warning'}>{t(`land.allocKind.${c.getValue() as string}`)}</Badge> },
    { id: 'to', header: t('land.to'), accessorFn: (a) => (a.kind === 'TO_FARMER' ? ll.farmerName(a.farmerId) : a.kind === 'TO_AGENT' ? lk.agent(a.agentId) : orgs.find((o) => o.id === a.toOrgId)?.name ?? '—') },
    { id: 'community', header: t('col.community'), accessorFn: (a) => (a.communityId ? lk.community(a.communityId) : '—') },
    { id: 'species', header: t('land.species'), accessorFn: (a) => ll.speciesName(a.speciesId) },
    { id: 'qty', header: t('col.quantity'), accessorKey: 'quantity', cell: (c) => f.number(c.getValue() as number) },
    { id: 'codes', header: t('land.codes'), accessorFn: (a) => (a.codes.length ? `${a.codes[0]} – ${a.codes.at(-1)}` : '—'), cell: (c) => <span className="whitespace-nowrap font-mono text-[12px]">{c.getValue() as string}</span> },
    { id: 'agent', header: t('col.agent'), accessorFn: (a) => (a.kind === 'TO_FARMER' ? lk.agent(a.agentId) : '—') },
    { id: 'device', header: t('land.recordedOn'), accessorFn: (a) => t(`people.device.${a.device ?? 'web'}`) },
  ], [t, f, lk, ll, orgs]);
  // Timeline for the chosen agent: what they received and gave out, by date.
  const timeline = agent ? rows.filter((a) => a.agentId === agent).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  let held = 0;
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('land.searchAllocations')}
        filters={[
          { key: 'agent', label: t('col.agent'), value: agent, onChange: setAgent, options: [...new Set(rows.map((a) => a.agentId).filter(Boolean) as string[])].map((id) => ({ value: id, label: lk.agent(id) })) },
          { key: 'kind', label: t('col.type'), value: kind, onChange: setKind, options: ['TO_AGENT', 'TO_FARMER', 'TO_COMPANY'].map((k) => ({ value: k, label: t(`land.allocKind.${k}`) })) },
        ]}
        onClear={() => { setQ(''); setAgent(''); setKind(''); }} />
      {agent && (
        <section className="mb-4 rounded-card border border-line bg-surface p-4 shadow-soft">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('land.agentTimeline', { name: lk.agent(agent) })}</h3>
          <ol className="relative max-h-56 space-y-2 overflow-y-auto border-l border-line pl-4 text-[13px]">
            {timeline.map((a) => { held += a.kind === 'TO_AGENT' ? a.quantity : -a.quantity; return <li key={a.id}><span className="text-muted">{f.date(a.createdAt)}</span> · {a.kind === 'TO_AGENT' ? t('land.tl.received', { n: a.quantity, species: ll.speciesName(a.speciesId) }) : t('land.tl.gave', { n: a.quantity, name: ll.farmerName(a.farmerId) })} <span className="tnum text-muted">{t('land.tl.holding', { n: held })}</span></li>; })}
          </ol>
        </section>
      )}
      <DataTable columns={columns} data={shown} getRowId={(a) => a.id} empty={t('land.noAllocations')} exportCsv={{ fileName: 'seedling-allocations.csv', columns: [{ header: t('col.date'), value: (a) => a.createdAt.slice(0, 10) }, { header: t('col.type'), value: (a) => a.kind }, { header: t('land.to'), value: (a) => ll.farmerName(a.farmerId) }, { header: t('land.species'), value: (a) => ll.speciesName(a.speciesId) }, { header: t('col.quantity'), value: (a) => a.quantity }, { header: t('land.codes'), value: (a) => a.codes.join(' ') }] }} />
    </>
  );
}

function TransfersTab() {
  const { t } = useT();
  const f = useFormat();
  const ll = useLandLookups();
  const { orgId, userId } = useActor();
  const all = useLandStore((s) => s.allocations).filter((a) => a.kind === 'TO_COMPANY' && (a.toOrgId === orgId || a.orgId === orgId));
  const orgs = usePlatformStore((s) => s.orgs);
  const name = (id?: string) => orgs.find((o) => o.id === id)?.name ?? '—';
  if (!all.length) return <TabEmpty>{t('land.noTransfers')}</TabEmpty>;
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-soft">{all.map((a) => (
      <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[14px]">
        <span><span className="block font-medium text-ink">{a.toOrgId === orgId ? t('land.fromCompany', { name: name(a.orgId) }) : t('land.toCompany', { name: name(a.toOrgId) })}</span><span className="text-[12px] text-muted">{`${f.number(a.quantity)} · ${ll.speciesName(a.speciesId)} · ${f.date(a.createdAt)}`}</span></span>
        {a.consent?.status === 'PENDING' && a.toOrgId === orgId
          ? <PermissionGate permission="seedlings.assign"><span className="flex gap-2"><Button size="sm" onClick={() => { answerTransfer(a.id, true, userId ?? 'system'); toast.success(t('land.toast.accepted', { n: a.quantity })); }}>{t('land.accept')}</Button><Button size="sm" variant="secondary" onClick={() => { answerTransfer(a.id, false, userId ?? 'system'); toast.success(t('land.toast.declined')); }}>{t('land.decline')}</Button></span></PermissionGate>
          : <Badge tone={a.consent?.status === 'ACCEPTED' ? 'success' : a.consent?.status === 'DECLINED' ? 'danger' : 'warning'}>{t(`land.consent.${a.consent?.status ?? 'PENDING'}`)}</Badge>}
      </li>
    ))}</ul>
  );
}

function AssignDialog({ lot, onClose }: { lot: SeedlingLot; onClose: () => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const orgs = usePlatformStore((s) => s.orgs).filter((o) => o.id !== orgId && (o.type === 'SUPPLIER' || o.type === 'BOTH'));
  const free = lotAvailable(lot);
  const [to, setTo] = useState<'agent' | 'farmer' | 'company'>('agent');
  const [agentId, setAgentId] = useState(lk.agents[0]?.id ?? '');
  const [farmerQ, setFarmerQ] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [companyId, setCompanyId] = useState(orgs[0]?.id ?? '');
  const [qty, setQty] = useState(String(Math.min(free.length, to === 'farmer' ? settings.land.maxSeedlingsPerFarmer : 100)));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers)).filter((f) => !farmerQ || `${f.firstName} ${f.lastName} ${f.farmerCode}`.toLowerCase().includes(farmerQ.toLowerCase())).slice(0, 8);
  const n = Number(qty);
  const room = farmerId ? settings.land.maxSeedlingsPerFarmer - farmerSeedlings(orgId, farmerId) : Infinity;
  const invalid = !(n > 0) || n > free.length || (to === 'agent' && !agentId) || (to === 'farmer' && (!farmerId || n > room)) || (to === 'company' && !companyId);
  const save = () => {
    try {
      if (to === 'agent') assignToAgent(lot.id, agentId, n, userId ?? 'system');
      else if (to === 'farmer') assignToFarmer({ orgId, farmerId, speciesId: lot.speciesId, codes: free.slice(0, n), quantity: n, lotId: lot.id, actorId: userId ?? 'system' });
      else transferToCompany(lot.id, companyId, n, userId ?? 'system');
      toast.success(t(`land.toast.assigned.${to}`, { n }));
      onClose();
    } catch (e) { toast.error(t(`land.error.${(e as Error).message}`, { defaultValue: (e as Error).message })); }
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('land.assignFrom', { number: lot.number })}</DialogTitle><DialogDescription>{t('land.freeN', { n: free.length, species: ll.speciesName(lot.speciesId) })}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('land.assignTo')}>
            {([['agent', UserPlus], ['farmer', UserPlus], ['company', ArrowRightLeft]] as const).map(([k, Icon]) => <button key={k} type="button" role="radio" aria-checked={to === k} onClick={() => setTo(k)} className={cn('flex items-center justify-center gap-1.5 rounded-ctl border px-2 py-2.5 text-[13px] font-medium', to === k ? 'border-brand bg-brand-soft text-ink' : 'border-line text-body')}><Icon className="h-4 w-4" /> {t(`land.assignKind.${k}`)}</button>)}
          </div>
          {to === 'agent' && <Field label={t('col.agent')}><select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label={t('col.agent')} className={select}>{lk.agents.map((a) => <option key={a.id} value={a.id}>{lk.agent(a.id)}</option>)}</select></Field>}
          {to === 'farmer' && (
            <Field label={t('land.farmer')} helper={farmerId ? t('land.roomLeft', { n: room, max: settings.land.maxSeedlingsPerFarmer }) : undefined}>
              <Input value={farmerQ} onChange={(e) => { setFarmerQ(e.target.value); setFarmerId(''); }} placeholder={t('land.searchFarmer')} aria-label={t('land.farmer')} />
              <ul className="mt-2 max-h-40 divide-y divide-line overflow-y-auto rounded-ctl border border-line">{farmers.map((f) => <li key={f.id}><button type="button" onClick={() => setFarmerId(f.id)} className={cn('w-full px-3 py-2 text-left text-[13px]', farmerId === f.id ? 'bg-brand-soft text-ink' : 'hover:bg-canvas')}>{`${f.firstName} ${f.lastName}`} <span className="text-muted">{`· ${f.farmerCode} · ${lk.community(f.communityId)}`}</span></button></li>)}</ul>
            </Field>
          )}
          {to === 'company' && <Field label={t('land.company')} helper={t('land.consentHint')}><select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label={t('land.company')} className={select}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}
          <Field label={t('col.quantity')}><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={t('col.quantity')} /></Field>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('land.assign')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Receive seedlings: codes are generated in the background with a progress bar. */
function ReceiveSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const org = useCurrentOrg();
  const { orgId, userId } = useActor();
  const ll = useLandLookups();
  const nurseries = useOrgRows(useLandStore((s) => s.nurseries));
  const [source, setSource] = useState<SeedlingLot['source']>('EXTERNAL');
  const [speciesId, setSpeciesId] = useState(ll.species[0]?.id ?? '');
  const [batchKey, setBatchKey] = useState('');
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('');
  const [receivedAt, setReceivedAt] = useState(today());
  const [cost, setCost] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<SeedlingLot | null>(null);
  const batches = nurseries.flatMap((n) => n.batches.filter((b) => b.alive - b.disbursed > 0).map((b) => ({ key: `${n.id}|${b.id}`, label: `${n.name} · ${b.number} · ${ll.speciesName(b.speciesId)} (${f.number(b.alive - b.disbursed)})`, n, b })));
  const chosen = batches.find((x) => x.key === batchKey);
  const n = Number(quantity);
  const max = chosen ? chosen.b.alive - chosen.b.disbursed : Infinity;
  const invalid = !(n > 0) || n > max || (source === 'EXTERNAL' ? !supplier.trim() : !chosen);
  useEffect(() => {
    if (progress == null || progress >= 1) return;
    const id = setTimeout(() => setProgress(Math.min(1, progress + 0.1)), 120);
    return () => clearTimeout(id);
  }, [progress]);
  const dec = org.currency === 'XOF' ? 0 : 2;
  const save = () => {
    try {
      setProgress(0);
      const lot = receiveLot({ orgId, source, speciesId: chosen?.b.speciesId ?? speciesId, quantity: n, receivedAt, supplierName: source === 'EXTERNAL' ? supplier.trim() : undefined, nurseryId: chosen?.n.id, batchId: chosen?.b.id, costMinor: cost ? Math.round(Number(cost) * 10 ** dec) : undefined, currency: org.currency, actorId: userId ?? 'system' });
      setDone(lot);
    } catch (e) { setProgress(null); toast.error(t(`land.error.${(e as Error).message}`, { defaultValue: (e as Error).message })); }
  };
  const select = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  const finished = done && progress != null && progress >= 1;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('land.receiveLot')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('land.source')}>
            {(['EXTERNAL', 'NURSERY'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={source === k} disabled={!!done} onClick={() => setSource(k)} className={cn('rounded-ctl border px-3 py-3 text-left text-[14px]', source === k ? 'border-brand bg-brand-soft' : 'border-line')}><span className="block font-semibold text-ink">{t(`land.lotSource.${k}`)}</span><span className="text-[12px] text-muted">{t(`land.lotSourceHint.${k}`)}</span></button>)}
          </div>
          {source === 'EXTERNAL' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('land.supplier')}><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label={t('land.supplier')} /></Field>
              <Field label={t('land.species')}><select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} aria-label={t('land.species')} className={select}>{ll.species.map((s) => <option key={s.id} value={s.id}>{ll.speciesName(s.id)}</option>)}</select></Field>
            </div>
          ) : <Field label={t('land.nurseryBatch')}><select value={batchKey} onChange={(e) => setBatchKey(e.target.value)} aria-label={t('land.nurseryBatch')} className={select}><option value="">{t('land.pickBatch')}</option>{batches.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></Field>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('col.quantity')} error={n > max ? t('land.error.moreThanAlive') : undefined}><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label={t('col.quantity')} /></Field>
            <Field label={t('land.receivedAt')}><Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} aria-label={t('land.receivedAt')} /></Field>
            {source === 'EXTERNAL' && <Field label={t('land.costIn', { currency: org.currency })}><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} aria-label={t('land.cost')} /></Field>}
          </div>
          {progress != null && (
            <div className="rounded-ctl border border-line bg-canvas p-4" aria-live="polite">
              <div className="mb-2 flex justify-between text-[13px]"><span className="font-medium text-ink">{finished ? t('land.codesReady') : t('land.generatingCodes')}</span><span className="tnum text-muted">{`${Math.round(progress * 100)}%`}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress * 100}%` }} /></div>
              {finished && <p className="mt-3 text-[14px] text-ink">{t('land.codesRange', { n: done.quantity, from: done.codeFrom, to: done.codeTo, number: done.number })}</p>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          {finished ? <Button onClick={() => { toast.success(t('land.toast.lot', { number: done.number })); onClose(); }}>{t('common.close')}</Button> : <><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid || !!done} onClick={save}>{t('land.receive')}</Button></>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
