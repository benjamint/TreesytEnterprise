import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, List, Map as MapIcon, Plus, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import type { Nursery, NurseryRound, NurseryRoundValues } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { FilePick } from '@/components/shared/FilePick';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { HBars, Lines } from '@/components/charts/charts';
import { addBatch, createNursery, nextRound, nurseryTotals, recordRound, roundsDue, setNurseryAgreement } from '@/services/landService';
import { cn } from '@/lib/utils';
import { useLandStore } from '@/stores/landStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { LandMap, useLandLookups } from './shared';

const today = () => new Date().toISOString().slice(0, 10);
const roundLabel = (r: Pick<NurseryRound, 'kind' | 'seq'>, t: (k: string, o?: Record<string, unknown>) => string) => (r.kind === 'PRIMARY' ? t('land.round.PRIMARY') : t('land.round.SECONDARY', { n: r.seq }));

/** Nurseries (PRD I1): list or map, dashboard, detail with batches, monitoring rounds, images and agreement. */
export function NurseriesPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const rows = useOrgRows(useLandStore((s) => s.nurseries));
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'due' | 'noAgreement'>('all');
  const [community, setCommunity] = useState('');
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [creating, setCreating] = useState(false);
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('month');
  const inView = (n: Nursery, v: typeof view) => v === 'all' || (v === 'due' ? roundsDue(n).length > 0 : !n.agreement);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((n) => inView(n, view) && (!community || n.communityId === community) && (!query || [n.name, n.code, n.representative.name].some((x) => x.toLowerCase().includes(query))));
  const totals = nurseryTotals({ batches: rows.flatMap((n) => n.batches) });
  const bySpecies = ll.species.map((s) => ({ label: ll.speciesName(s.id), value: rows.flatMap((n) => n.batches).filter((b) => b.speciesId === s.id).reduce((a, b) => a + b.alive, 0) })).filter((x) => x.value > 0);
  // Germinated and alive seedlings recorded per period.
  const history = useMemo(() => {
    const key = (iso: string) => (period === 'day' ? iso.slice(0, 10) : period === 'month' ? iso.slice(0, 7) : iso.slice(0, 4));
    const m = new Map<string, { germinated: number; alive: number }>();
    for (const b of rows.flatMap((n) => n.batches)) for (const h of b.history) { const k = key(h.at); const x = m.get(k) ?? { germinated: 0, alive: 0 }; x.germinated += h.germinated; x.alive += h.alive; m.set(k, x); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([k, x]) => ({ label: period === 'month' ? f.date(`${k}-15`, 'MMM yy') : period === 'day' ? f.date(k, 'd MMM') : k, ...x }));
  }, [rows, period, f]);
  const columns = useMemo<ColumnDef<Nursery, unknown>[]>(() => [
    { id: 'code', header: t('col.number'), accessorKey: 'code', cell: (c) => mono(c.getValue() as string) },
    { id: 'name', header: t('land.nursery'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'community', header: t('col.community'), accessorFn: (n) => lk.community(n.communityId) },
    { id: 'agent', header: t('col.agent'), accessorFn: (n) => lk.agent(n.agentId) },
    { id: 'fenced', header: t('land.fenced'), accessorFn: (n) => (n.fenced ? t('common.yes') : t('common.no')) },
    { id: 'water', header: t('land.water'), accessorFn: (n) => t(`land.waterSource.${n.waterSource}`, { defaultValue: n.waterSource }) },
    { id: 'batches', header: t('land.batches'), accessorFn: (n) => n.batches.length },
    { id: 'alive', header: t('land.alive'), accessorFn: (n) => nurseryTotals(n).alive, cell: (c) => f.number(c.getValue() as number) },
    { id: 'germ', header: t('land.germinationPct'), accessorFn: (n) => nurseryTotals(n).germinationPct, cell: (c) => `${f.number(c.getValue() as number)}%` },
    { id: 'surv', header: t('land.survivalPct'), accessorFn: (n) => nurseryTotals(n).survivalPct, cell: (c) => `${f.number(c.getValue() as number)}%` },
    { id: 'next', header: t('land.nextRound'), accessorFn: (n) => nextRound(n)?.dueDate ?? '', cell: (c) => { const r = nextRound(c.row.original); if (!r) return <span className="text-muted">{'—'}</span>; const late = r.dueDate < today(); return <span className="flex items-center gap-1.5 whitespace-nowrap">{roundLabel(r, t)} · {f.date(r.dueDate, 'd MMM')}{late && <Badge tone="danger">{t('land.overdue')}</Badge>}</span>; } },
    { id: 'rep', header: t('land.representative'), accessorFn: (n) => n.representative.name },
  ], [t, f, lk]);
  const current = rows.find((n) => n.id === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.trees')} title={t('nav.nurseries')} description={t('pages.nurseries')}
        primary={<PermissionGate permission="nurseries.create"><Button onClick={() => setCreating(true)}><Plus /> {t('land.newNursery')}</Button></PermissionGate>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('nav.nurseries')} value={f.number(rows.length)} hint={t('land.roundsDueN', { count: rows.filter((n) => roundsDue(n).length).length })} icon={Sprout} />
        <StatCard label={t('land.germinationPct')} value={`${f.number(totals.germinationPct)}%`} hint={t('land.ofPotted', { n: f.number(totals.potted) })} />
        <StatCard label={t('land.survivalPct')} value={`${f.number(totals.survivalPct)}%`} hint={t('land.ofGerminated', { n: f.number(totals.germinated) })} />
        <StatCard label={t('land.seedlingsAlive')} value={f.number(totals.alive)} hint={t('land.disbursedN', { n: f.number(totals.disbursed) })} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">{t('land.germinationTrend')}</h3>
            <div className="flex gap-1" role="group" aria-label={t('land.period')}>{(['day', 'month', 'year'] as const).map((p) => <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={cn('rounded-chip px-2.5 py-1 text-[12px] font-medium', period === p ? 'bg-brand text-on-brand' : 'text-muted hover:bg-canvas')}>{t(`land.periodName.${p}`)}</button>)}</div>
          </div>
          {history.length ? <Lines data={history} series={[{ key: 'germinated', label: t('land.germinated'), index: 0 }, { key: 'alive', label: t('land.alive'), index: 2 }]} format={(v) => f.number(v)} /> : <TabEmpty>{t('land.noRounds')}</TabEmpty>}
        </section>
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{t('land.aliveBySpecies')}</h3>{bySpecies.length ? <HBars data={bySpecies} format={(v) => f.number(v)} /> : <TabEmpty>{t('land.noBatches')}</TabEmpty>}</section>
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('land.searchNurseries')}
        views={(['all', 'due', 'noAgreement'] as const).map((v) => ({ key: v, label: t(`land.nView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((n) => inView(n, v)).length }))}
        filters={[{ key: 'community', label: t('col.community'), value: community, onChange: setCommunity, options: [...new Set(rows.map((n) => n.communityId))].map((c) => ({ value: c, label: lk.community(c) })) }]}
        onClear={() => { setQ(''); setCommunity(''); setView('all'); }}
        extra={<ModeToggle mode={mode} onMode={setMode} />} />
      {mode === 'list'
        ? <DataTable columns={columns} data={shown} onRowClick={(n) => open(n.id)} activeId={openId} getRowId={(n) => n.id} empty={t('land.noNurseries')} exportCsv={{ fileName: 'nurseries.csv', columns: [{ header: t('col.number'), value: (n) => n.code }, { header: t('land.nursery'), value: (n) => n.name }, { header: t('land.alive'), value: (n) => nurseryTotals(n).alive }, { header: t('land.germinationPct'), value: (n) => nurseryTotals(n).germinationPct }, { header: t('land.survivalPct'), value: (n) => nurseryTotals(n).survivalPct }] }} />
        : <LandMap ariaLabel={t('nav.nurseries')} height={520} points={shown.map((n) => ({ id: n.id, lat: n.gps.lat, lng: n.gps.lng, color: roundsDue(n).length ? 'rgb(var(--danger))' : 'var(--series-3)', label: `${n.name} · ${f.number(nurseryTotals(n).alive)}`, onClick: () => open(n.id) }))} legend={[{ label: t('land.onTrack'), color: 'var(--series-3)' }, { label: t('land.roundDue'), color: 'rgb(var(--danger))' }]} />}
      {current && <NurseryDrawer key={current.id} nursery={current} onClose={close} />}
      {creating && <NewNurserySheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

export function ModeToggle({ mode, onMode }: { mode: 'list' | 'map'; onMode: (m: 'list' | 'map') => void }) {
  const { t } = useT();
  return (
    <div className="flex rounded-ctl border border-line bg-surface p-0.5" role="group" aria-label={t('land.viewAs')}>
      {(['list', 'map'] as const).map((m) => { const Icon = m === 'list' ? List : MapIcon; return <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)} className={cn('flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium', mode === m ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink')}><Icon className="h-4 w-4" /> {t(`land.mode.${m}`)}</button>; })}
    </div>
  );
}

function NurseryDrawer({ nursery: n, onClose }: { nursery: Nursery; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const { userId } = useActor();
  const [round, setRound] = useState<NurseryRound | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [agreement, setAgreement] = useState<string>();
  const tot = nurseryTotals(n);
  const due = roundsDue(n);
  return (
    <>
      <DetailDrawer open onClose={onClose} title={n.name} subtitle={`${n.code} · ${lk.community(n.communityId)} · ${lk.agent(n.agentId)}`}
        badges={<>{due.length > 0 && <Badge tone="danger">{t('land.roundOverdue', { round: roundLabel(due[0]!, t) })}</Badge>}{n.agreement ? <Badge tone="success">{t('land.agreementSigned')}</Badge> : <Badge tone="warning">{t('land.noAgreement')}</Badge>}</>}
        actions={<>
          {nextRound(n) && <PermissionGate permission="nurseries.edit"><Button size="sm" onClick={() => setRound(nextRound(n)!)}><ClipboardCheck /> {t('land.recordRound', { round: roundLabel(nextRound(n)!, t) })}</Button></PermissionGate>}
          <PermissionGate permission="nurseries.edit"><Button size="sm" variant="secondary" onClick={() => setBatchOpen(true)}><Plus /> {t('land.addBatch')}</Button></PermissionGate>
        </>}
        tabs={[
          {
            key: 'profile', label: t('land.tab.profile'), content: (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([[t('land.potted'), tot.potted], [t('land.germinated'), tot.germinated], [t('land.alive'), tot.alive], [t('land.disbursed'), tot.disbursed]] as [string, number][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[18px] font-semibold text-ink">{f.number(v)}</div></div>)}</div>
                <Facts items={[
                  [t('col.community'), lk.community(n.communityId)], [t('col.agent'), lk.agent(n.agentId)],
                  [t('land.gps'), `${n.gps.lat.toFixed(5)}, ${n.gps.lng.toFixed(5)}`], [t('land.fenced'), n.fenced ? t('common.yes') : t('common.no')],
                  [t('land.water'), t(`land.waterSource.${n.waterSource}`, { defaultValue: n.waterSource })], [t('land.material'), n.material],
                  [t('land.representative'), `${n.representative.name} · ${t(`gender.${n.representative.gender}`)}`], [t('land.repPhone'), n.representative.phone],
                  [t('land.germinationPct'), `${f.number(tot.germinationPct)}%`], [t('land.survivalPct'), `${f.number(tot.survivalPct)}%`],
                ]} />
                <LandMap ariaLabel={n.name} height={220} points={[{ id: n.id, lat: n.gps.lat, lng: n.gps.lng, color: 'var(--series-3)', label: n.name }]} />
              </div>
            ),
          },
          {
            key: 'batches', label: t('land.batches'), count: n.batches.length, content: (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded-ctl border border-line">
                  <table className="w-full min-w-[620px] text-[13px]">
                    <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">{[t('land.batch'), t('land.species'), t('land.polyBags'), t('land.potted'), t('land.germinated'), t('land.alive'), t('land.disbursed')].map((h, i) => <th key={h} className={cn('px-3 py-2 font-semibold', i > 1 && 'text-right')}>{h}</th>)}</tr></thead>
                    <tbody>{n.batches.map((b) => <tr key={b.id} className="border-b border-line last:border-0"><td className="px-3 py-2 font-mono text-ink">{b.number}</td><td className="px-3 py-2">{ll.speciesName(b.speciesId)}</td>{[b.quantity, b.potted, b.germinated, b.alive, b.disbursed].map((v, i) => <td key={i} className="tnum px-3 py-2 text-right">{f.number(v)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
                {n.batches.map((b) => b.history.length > 0 && (
                  <div key={b.id}>
                    <h4 className="mb-2 text-[13px] font-semibold text-ink">{t('land.batchHistory', { number: b.number })}</h4>
                    <Lines data={b.history.map((h) => { const r = n.rounds.find((x) => x.id === h.roundId); return { label: r ? roundLabel(r, t) : f.date(h.at, 'd MMM'), germinationPct: b.potted ? Math.round((h.germinated / b.potted) * 100) : 0, survivalPct: h.germinated ? Math.round((h.alive / h.germinated) * 100) : 0 }; })}
                      series={[{ key: 'germinationPct', label: t('land.germinationPct'), index: 0 }, { key: 'survivalPct', label: t('land.survivalPct'), index: 2 }]} format={(v) => `${v}%`} />
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'monitoring', label: t('land.tab.monitoring'), count: n.rounds.length, content: (
              <ul className="divide-y divide-line rounded-ctl border border-line">{n.rounds.map((r) => {
                const late = !r.doneAt && r.dueDate < today();
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-[14px]">
                    <span><span className="block font-medium text-ink">{roundLabel(r, t)}</span><span className="text-[12px] text-muted">{r.doneAt ? t('land.doneOn', { date: f.dateTime(r.doneAt), name: lk.user(r.by ?? '') }) : t('land.dueOn', { date: f.date(r.dueDate) })}</span></span>
                    {r.doneAt ? <Badge tone="success">{t('land.done')}</Badge> : late ? <Badge tone="danger">{t('land.overdue')}</Badge> : <Badge tone="neutral">{t('land.upcoming')}</Badge>}
                  </li>
                );
              })}</ul>
            ),
          },
          {
            key: 'images', label: t('land.tab.images'), count: n.images.length, content: n.images.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{n.images.map((img) => <li key={img.id} className="rounded-ctl border border-line p-2"><div className="flex h-24 items-center justify-center rounded-[6px] bg-canvas text-[12px] text-muted">{img.name}</div><div className="mt-1.5 text-[12px] text-body">{t(`land.imageKind.${img.kind}`)}</div><div className="text-[11px] text-muted">{f.date(img.at)}</div></li>)}</ul>
            ) : <TabEmpty>{t('land.noImages')}</TabEmpty>,
          },
          {
            key: 'agreement', label: t('land.tab.agreement'), content: n.agreement ? (
              <Facts items={[[t('land.agreementFile'), n.agreement.name], [t('land.uploaded'), `${lk.user(n.agreement.by)} · ${f.dateTime(n.agreement.at)}`]]} />
            ) : (
              <div className="space-y-3">
                <p className="text-[14px] text-muted">{t('land.agreementHint')}</p>
                <FilePick label={t('land.agreementFile')} value={agreement} onChange={setAgreement} sample="nursery-agreement.pdf" />
                <PermissionGate permission="nurseries.edit"><Button size="sm" disabled={!agreement} onClick={() => { setNurseryAgreement(n.id, agreement!, userId ?? 'system'); toast.success(t('land.toast.agreement')); }}>{t('common.save')}</Button></PermissionGate>
              </div>
            ),
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="nursery" entityId={n.id} /> },
        ]} />
      {round && <RoundDialog nursery={n} round={round} onClose={() => setRound(null)} />}
      {batchOpen && <BatchDialog nursery={n} onClose={() => setBatchOpen(false)} />}
    </>
  );
}

/** Primary: poly bags, potted, germinated. Secondary: alive, dead, new germinations — per batch. */
export function RoundDialog({ nursery: n, round: r, onClose }: { nursery: Nursery; round: NurseryRound; onClose: () => void }) {
  const { t } = useT();
  const ll = useLandLookups();
  const settings = useOrgSettings();
  const { userId } = useActor();
  const def = settings.land.nurseryRounds.find((d) => d.id === r.defId);
  const fields = def?.fields ?? (r.kind === 'PRIMARY' ? ['polyBags', 'potted', 'germinated'] : ['alive', 'dead', 'newGerminations']);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(n.batches.map((b) => [b.id, Object.fromEntries(fields.map((k) => [k, k === 'polyBags' ? String(b.quantity) : k === 'alive' ? String(b.alive) : '']))])));
  const [photo, setPhoto] = useState<string>();
  const values: NurseryRoundValues[] = n.batches.map((b) => ({ batchId: b.id, ...Object.fromEntries(fields.map((k) => [k, vals[b.id]?.[k] === '' ? undefined : Number(vals[b.id]?.[k])])) }));
  const invalid = n.batches.some((b) => fields.some((k) => vals[b.id]?.[k] === '' && k !== 'dead' && k !== 'newGerminations')) || values.some((v) => (v.potted ?? 0) > (v.polyBags ?? Infinity) || (v.germinated ?? 0) > (v.potted ?? Infinity));
  const save = () => {
    recordRound(n.id, r.id, values, { photos: photo ? [photo] : [], actorId: userId ?? 'system', device: 'web' });
    toast.success(t('land.toast.round', { round: roundLabel(r, t), name: n.name }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('land.recordRound', { round: roundLabel(r, t) })}</DialogTitle><DialogDescription>{t('land.roundHint', { date: r.dueDate })}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          {n.batches.map((b) => (
            <div key={b.id} className="rounded-ctl border border-line p-3">
              <div className="mb-2 text-[13px] font-semibold text-ink">{`${b.number} · ${ll.speciesName(b.speciesId)}`}</div>
              <div className="grid grid-cols-3 gap-2">{fields.map((k) => <Field key={k} label={t(`land.${k}`)}><Input type="number" min={0} value={vals[b.id]?.[k] ?? ''} onChange={(e) => setVals({ ...vals, [b.id]: { ...vals[b.id], [k]: e.target.value } })} aria-label={`${b.number} ${t(`land.${k}`)}`} /></Field>)}</div>
            </div>
          ))}
          <FilePick label={t('land.roundPhoto')} value={photo} onChange={setPhoto} sample="nursery-round.jpg" />
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchDialog({ nursery: n, onClose }: { nursery: Nursery; onClose: () => void }) {
  const { t } = useT();
  const ll = useLandLookups();
  const { userId } = useActor();
  const [speciesId, setSpeciesId] = useState(ll.species[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [sownAt, setSownAt] = useState(today());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('land.addBatch')}</DialogTitle><DialogDescription>{n.name}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('land.species')}><select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} aria-label={t('land.species')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px]">{ll.species.map((s) => <option key={s.id} value={s.id}>{ll.speciesName(s.id)}</option>)}</select></Field>
          <Field label={t('land.polyBags')}><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label={t('land.polyBags')} /></Field>
          <Field label={t('land.sownAt')}><Input type="date" value={sownAt} onChange={(e) => setSownAt(e.target.value)} aria-label={t('land.sownAt')} /></Field>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!(Number(quantity) > 0)} onClick={() => { const b = addBatch(n.id, { speciesId, quantity: Number(quantity), sownAt }, userId ?? 'system'); toast.success(t('land.toast.batch', { number: b.number })); onClose(); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewNurserySheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const ll = useLandLookups();
  const [v, setV] = useState({ name: '', communityId: lk.communities[0]?.id ?? '', agentId: lk.agents[0]?.id ?? '', fenced: true, waterSource: 'borehole', material: 'Poly bags', repName: '', repGender: 'F' as 'F' | 'M', repPhone: '' });
  const [batches, setBatches] = useState([{ speciesId: ll.species[0]?.id ?? '', quantity: '', sownAt: today() }]);
  const [photo, setPhoto] = useState<string>();
  const [agreement, setAgreement] = useState<string>();
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const community = lk.communities.find((c) => c.id === v.communityId);
  const invalid = !v.name.trim() || !v.communityId || !v.repName.trim() || batches.some((b) => !(Number(b.quantity) > 0));
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  const save = () => {
    const n = createNursery({
      orgId, name: v.name.trim(), communityId: v.communityId, agentId: v.agentId || undefined, gps: { lat: Number(((community?.gps.lat ?? 0) + 0.002).toFixed(6)), lng: Number(((community?.gps.lng ?? 0) + 0.002).toFixed(6)), accuracy: 5 },
      fenced: v.fenced, waterSource: v.waterSource, material: v.material, representative: { name: v.repName.trim(), gender: v.repGender, phone: v.repPhone.trim() },
      batches: batches.map((b) => ({ speciesId: b.speciesId, quantity: Number(b.quantity), sownAt: b.sownAt })), images: photo ? [photo] : [], agreement, actorId: userId ?? 'system',
    });
    toast.success(t('land.toast.nursery', { name: n.name }), { description: t('land.toast.roundsPlanned', { count: n.rounds.length }) });
    onClose(n.id);
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('land.newNursery')}</SheetTitle></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('land.nurseryName')}><Input value={v.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('land.nurseryName')} /></Field>
            <Field label={t('col.community')}><select value={v.communityId} onChange={(e) => set({ communityId: e.target.value })} aria-label={t('col.community')} className={select}>{lk.communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('col.agent')}><select value={v.agentId} onChange={(e) => set({ agentId: e.target.value })} aria-label={t('col.agent')} className={select}>{lk.agents.map((a) => <option key={a.id} value={a.id}>{lk.agent(a.id)}</option>)}</select></Field>
            <Field label={t('land.water')}><select value={v.waterSource} onChange={(e) => set({ waterSource: e.target.value })} aria-label={t('land.water')} className={select}>{['borehole', 'dam', 'river', 'well', 'pipe'].map((w) => <option key={w} value={w}>{t(`land.waterSource.${w}`)}</option>)}</select></Field>
            <Field label={t('land.material')}><Input value={v.material} onChange={(e) => set({ material: e.target.value })} aria-label={t('land.material')} /></Field>
            <div className="flex items-end pb-2"><Checkbox label={t('land.fenced')} checked={v.fenced} onChange={(e) => set({ fenced: e.target.checked })} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('land.representative')}><Input value={v.repName} onChange={(e) => set({ repName: e.target.value })} aria-label={t('land.representative')} /></Field>
            <Field label={t('land.repGender')}><select value={v.repGender} onChange={(e) => set({ repGender: e.target.value as 'F' | 'M' })} aria-label={t('land.repGender')} className={select}><option value="F">{t('gender.F')}</option><option value="M">{t('gender.M')}</option></select></Field>
            <Field label={t('land.repPhone')}><Input value={v.repPhone} inputMode="tel" onChange={(e) => set({ repPhone: e.target.value })} aria-label={t('land.repPhone')} /></Field>
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-semibold text-ink">{t('land.batches')}</h3>
            {batches.map((b, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                <select value={b.speciesId} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, speciesId: e.target.value } : x)))} aria-label={t('land.species')} className={select}>{ll.species.map((s) => <option key={s.id} value={s.id}>{ll.speciesName(s.id)}</option>)}</select>
                <Input type="number" placeholder={t('land.polyBags')} value={b.quantity} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} aria-label={t('land.polyBags')} />
                <Input type="date" value={b.sownAt} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, sownAt: e.target.value } : x)))} aria-label={t('land.sownAt')} />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setBatches([...batches, { speciesId: ll.species[0]?.id ?? '', quantity: '', sownAt: today() }])}><Plus /> {t('land.addBatch')}</Button>
          </div>
          <FilePick label={t('land.profilePhoto')} value={photo} onChange={setPhoto} sample="nursery-profile.jpg" />
          <FilePick label={t('land.agreementFile')} value={agreement} onChange={setAgreement} sample="nursery-agreement.pdf" />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('common.save')}</Button></div>
      </SheetContent>
    </Sheet>
  );
}
