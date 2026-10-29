import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileCheck2, Loader2, Printer, Radar, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { DueDiligenceStatement } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { StatCard } from '@/components/shared/StatCard';
import { Checkbox, Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { complianceOverview, ddsGeoJson, excludePlots, generateDds, lotForDispatch, runDeforestationCheck, submitDds } from '@/services/landService';
import { cn, latency } from '@/lib/utils';
import { useLandStore } from '@/stores/landStore';
import { useSalesStore } from '@/stores/salesStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { CheckBadge, CHECK_COLOR, LandMap, plotShape, useArea, useLandLookups, usePageTab } from './shared';

const TABS = ['overview', 'plots', 'lots', 'statements'] as const;

/** EUDR compliance (PRD I5): overview, deforestation check, lots and due diligence statements. */
export function EudrPage() {
  const { t } = useT();
  const settings = useOrgSettings();
  const lk = useLookups();
  const [tab, setTab] = usePageTab(TABS, 'overview');
  const relevant = settings.commodities.filter((c) => c.eudrRelevant);
  const [commodityId, setCommodityId] = useState(relevant[0]?.id ?? '');
  return (
    <>
      <PageHeader eyebrow={t('nav.section.trees')} title={t('nav.eudr')} description={t('land.eudrHint', { date: settings.land.eudr.cutoffDate })}
        actions={relevant.length > 1 ? <select value={commodityId} onChange={(e) => setCommodityId(e.target.value)} aria-label={t('col.commodity')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px]">{relevant.map((c) => <option key={c.id} value={c.id}>{lk.commodity(c.id)}</option>)}</select> : undefined} />
      {!relevant.length && <div className="mb-5 rounded-card border border-info/30 bg-info/5 px-5 py-4 text-[14px] text-ink">{t('land.noEudrCommodity')} <Link to="/app/settings/commodities" className="font-medium underline">{t('land.openCommodities')}</Link></div>}
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>{t(`land.eTab.${k}`)}</button>)}
      </div>
      {tab === 'overview' && <Overview commodityId={commodityId} />}
      {tab === 'plots' && <RiskPlots />}
      {tab === 'lots' && <Lots commodityIds={relevant.map((c) => c.id)} />}
      {tab === 'statements' && <Statements commodityIds={relevant.map((c) => c.id)} />}
    </>
  );
}

function Overview({ commodityId }: { commodityId: string }) {
  const { t } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const ll = useLandLookups();
  const area = useArea();
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const zones = useOrgRows(useLandStore((s) => s.lossZones));
  const cutoff = useOrgSettings().land.eudr.cutoffDate;
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ checked: number; risk: number; clear: number } | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const o = useMemo(() => (commodityId ? complianceOverview(orgId, commodityId) : null), [orgId, commodityId, plots]);
  const unchecked = plots.filter((p) => !p.check || p.check.result === 'NOT_CHECKED').length;
  const run = async () => {
    setBusy(true);
    await latency(1200, 1500);
    const r = runDeforestationCheck(orgId, userId ?? 'system');
    setBusy(false);
    setLast(r);
    if (r.risk) toast.warning(t('land.toast.checkRisk', { count: r.checked, risk: r.risk })); else toast.success(t('land.toast.checkClear', { count: r.checked }));
  };
  return (
    <div className="space-y-5">
      {o && (
        <div className="stat-strip grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('land.tracePct')} value={`${f.number(o.tracePct)}%`} hint={t('land.traceKg', { kg: f.kg(Math.round(o.traceKg)), total: f.kg(Math.round(o.kg)) })} />
          <StatCard label={t('land.validPct')} value={`${f.number(o.validPct)}%`} hint={t('land.plotsN', { count: o.plots })} />
          <StatCard label={t('land.checkedPct')} value={`${f.number(o.checkedPct)}%`} hint={t('land.notCheckedN', { count: o.notChecked })} />
          <StatCard label={t('land.atRisk')} value={f.number(o.risk.length)} hint={t('land.cutoff', { date: f.date(cutoff) })} />
        </div>
      )}
      <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-[14px] font-semibold text-ink">{t('land.deforestationCheck')}</h3><p className="text-[13px] text-muted">{t('land.checkHint', { count: unchecked })}</p></div>
          <PermissionGate permission="eudr.runCheck"><Button onClick={run} disabled={busy || !unchecked}>{busy ? <Loader2 className="animate-spin" /> : <Radar />} {busy ? t('land.checking') : t('land.runCheck')}</Button></PermissionGate>
        </div>
        {last && <div className={cn('mb-3 rounded-ctl px-4 py-3 text-[14px]', last.risk ? 'bg-danger/5 text-ink' : 'bg-success/5 text-ink')} role="status">{t('land.checkResult', { count: last.checked, risk: last.risk, clear: last.clear })}</div>}
        <LandMap ariaLabel={t('land.deforestationCheck')} height={460}
          legend={[...(['CLEAR', 'RISK', 'NOT_CHECKED'] as const).map((x) => ({ label: t(`land.check.${x}`), color: CHECK_COLOR[x] })), { label: t('land.lossZone'), color: '#9b1c1c' }]}
          zones={zones.map((z) => ({ id: z.id, polygon: z.polygon, color: '#9b1c1c', label: t('land.lossZoneLabel', { name: z.name, year: z.lossYear }) }))}
          shapes={plots.filter((p) => p.polygon.length >= 3).map((p) => plotShape(p, `${p.code} · ${ll.farmerName(p.farmerId)} · ${area(p.areaHa)}`))} />
      </section>
    </div>
  );
}

function RiskPlots() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const [onlyRisk, setOnlyRisk] = useState(true);
  const shown = plots.filter((p) => (onlyRisk ? p.check?.result === 'RISK' : p.check?.result !== 'CLEAR')).sort((a, b) => (b.check?.lossHa ?? 0) - (a.check?.lossHa ?? 0));
  return (
    <div className="space-y-3">
      <Checkbox label={t('land.onlyRisk')} checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
      {shown.length ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-soft">{shown.map((p) => (
          <li key={p.id}><Link to={`/app/plots?open=${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[14px] hover:bg-canvas">
            <span><span className="block font-mono text-[13px] text-ink">{p.code}</span><span className="text-[12px] text-muted">{`${ll.farmerName(p.farmerId)} · ${lk.community(p.communityId)} · ${area(p.areaHa)}`}</span></span>
            <span className="flex items-center gap-2">{p.check?.lossHa ? <span className="text-[13px] text-danger">{t('land.lossHa', { ha: area(p.check.lossHa) })}</span> : null}{p.check?.at && <span className="text-[12px] text-muted">{f.date(p.check.at)}</span>}<CheckBadge result={p.check?.result} /></span>
          </Link></li>
        ))}</ul>
      ) : <TabEmpty>{onlyRisk ? t('land.noRisk') : t('land.allClear')}</TabEmpty>}
    </div>
  );
}

function Lots({ commodityIds }: { commodityIds: string[] }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const { userId } = useActor();
  const lots = useOrgRows(useLandStore((s) => s.eudrLots));
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const dispatches = useOrgRows(useSalesStore((s) => s.dispatches)).filter((d) => commodityIds.includes(d.commodityId) && !['REJECTED'].includes(d.status));
  const withoutLot = dispatches.filter((d) => !lots.some((l) => l.dispatchId === d.id));
  const risk = new Set(plots.filter((p) => p.check?.result === 'RISK').map((p) => p.id));
  return (
    <div className="space-y-4">
      {withoutLot.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-line bg-canvas px-4 py-3 text-[14px]">
          <span className="text-body">{t('land.dispatchesWithoutLot', { count: withoutLot.length })}</span>
          <PermissionGate permission="eudr.generateDds"><Button size="sm" variant="secondary" onClick={() => { withoutLot.forEach((d) => lotForDispatch(d.id, userId ?? 'system')); toast.success(t('land.toast.lots', { count: withoutLot.length })); }}>{t('land.buildLots')}</Button></PermissionGate>
        </div>
      )}
      {lots.length ? (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-soft">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">{[t('land.lot'), t('nav.dispatch'), t('col.commodity'), t('sales.weight'), t('land.purchasesN'), t('land.plotsCol'), t('land.atRisk')].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{lots.map((l) => { const d = dispatches.find((x) => x.id === l.dispatchId); const r = l.plotIds.filter((id) => risk.has(id)).length; return (
              <tr key={l.id} className="border-b border-line last:border-0"><td className="px-4 py-2.5">{mono(l.number)}</td><td className="px-4 py-2.5">{d ? <Link to={`/app/dispatch?open=${d.id}`} className="font-mono text-[13px] hover:underline">{d.number}</Link> : '—'}</td><td className="px-4 py-2.5">{lk.commodity(l.commodityId)}</td><td className="tnum px-4 py-2.5">{f.kg(Math.round(l.kg))}</td><td className="tnum px-4 py-2.5">{f.number(l.purchaseIds.length)}</td><td className="tnum px-4 py-2.5">{f.number(l.plotIds.length)}</td><td className="px-4 py-2.5">{r ? <Badge tone="danger">{f.number(r)}</Badge> : <Badge tone="success">{'0'}</Badge>}</td></tr>
            ); })}</tbody>
          </table>
        </div>
      ) : <TabEmpty>{t('land.noLots')}</TabEmpty>}
    </div>
  );
}

function Statements({ commodityIds }: { commodityIds: string[] }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const list = useOrgRows(useLandStore((s) => s.statements));
  const dispatches = useOrgRows(useSalesStore((s) => s.dispatches));
  const [openId, open, close] = useDrawerParam();
  const [creating, setCreating] = useState(false);
  const current = list.find((s) => s.id === openId);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><PermissionGate permission="eudr.generateDds"><Button onClick={() => setCreating(true)} disabled={!commodityIds.length}><FileCheck2 /> {t('land.generateDds')}</Button></PermissionGate></div>
      {list.length ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-soft">{[...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => (
          <li key={s.id}><button type="button" onClick={() => open(s.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left text-[14px] hover:bg-canvas">
            <span><span className="block font-mono text-[13px] text-ink">{s.number}</span><span className="text-[12px] text-muted">{`${dispatches.find((d) => d.id === s.dispatchId)?.number ?? '—'} · ${lk.commodity(s.commodityId)} · ${f.kg(Math.round(s.kg))} · ${t('land.plotsN', { count: s.plotIds.length })}`}</span></span>
            <span className="flex items-center gap-2">{s.reference && <span className="font-mono text-[12px] text-muted">{s.reference}</span>}<Badge tone={s.status === 'SUBMITTED' ? 'done' : s.risk === 'NON_NEGLIGIBLE' ? 'danger' : 'warning'}>{t(`land.dds.${s.status === 'SUBMITTED' ? 'SUBMITTED' : s.risk}`)}</Badge></span>
          </button></li>
        ))}</ul>
      ) : <TabEmpty>{t('land.noStatements')}</TabEmpty>}
      {current && <DdsDrawer key={current.id} dds={current} onClose={close} />}
      {creating && <GenerateDialog commodityIds={commodityIds} onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </div>
  );
}

function GenerateDialog({ commodityIds, onClose }: { commodityIds: string[]; onClose: (id?: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const sl = useSalesLookupsLite();
  const dispatches = useOrgRows(useSalesStore((s) => s.dispatches)).filter((d) => commodityIds.includes(d.commodityId) && !['REJECTED', 'PENDING_APPROVAL'].includes(d.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [dispatchId, setDispatchId] = useState(dispatches[0]?.id ?? '');
  const go = () => {
    try {
      const s = generateDds({ orgId, dispatchId, actorId: userId ?? 'system' });
      toast.success(t('land.toast.dds', { number: s.number }), { description: s.risk === 'NON_NEGLIGIBLE' ? t('land.ddsRiskNote', { count: s.riskPlotIds.length }) : undefined });
      onClose(s.id);
    } catch (e) { toast.error(t(`land.error.${(e as Error).message}`, { defaultValue: (e as Error).message })); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('land.generateDds')}</DialogTitle><DialogDescription>{t('land.generateHint')}</DialogDescription></DialogHeader>
        <Field label={t('nav.dispatch')}><select value={dispatchId} onChange={(e) => setDispatchId(e.target.value)} aria-label={t('nav.dispatch')} className="h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px]">{dispatches.map((d) => <option key={d.id} value={d.id}>{`${d.number} · ${sl(d.clientId)} · ${f.kg(Math.round(d.verification?.deliveredKg ?? d.expectedKg))} · ${t(`status.${d.status}`)}`}</option>)}</select></Field>
        <DialogFooter><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={!dispatchId} onClick={go}><FileCheck2 /> {t('land.generate')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useSalesLookupsLite() {
  const clients = useOrgRows(useSalesStore((s) => s.clients));
  return (id: string) => clients.find((c) => c.id === id)?.name ?? '—';
}

function DdsDrawer({ dds: s, onClose }: { dds: DueDiligenceStatement; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const area = useArea();
  const org = useCurrentOrg();
  const { userId } = useActor();
  const plots = useOrgRows(useLandStore((st) => st.plots)).filter((p) => s.plotIds.includes(p.id));
  const dispatch = useSalesStore((st) => st.dispatches.find((d) => d.id === s.dispatchId));
  const [submitting, setSubmitting] = useState(false);
  const risk = plots.filter((p) => p.check?.result === 'RISK');
  const unchecked = plots.filter((p) => !p.check || p.check.result === 'NOT_CHECKED');
  const download = () => {
    const blob = new Blob([JSON.stringify(ddsGeoJson(s), null, 2)], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.number}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(t('land.toast.geojson', { name: `${s.number}.geojson` }));
  };
  const submit = async () => {
    setSubmitting(true);
    await latency(1400, 1800);
    try {
      const r = submitDds(s.id, userId ?? 'system');
      toast.success(t('land.toast.submitted', { reference: r.reference }));
    } catch (e) { toast.error(t(`land.error.${(e as Error).message}`, { defaultValue: (e as Error).message })); }
    setSubmitting(false);
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) { toast.error(t('buy.popupBlocked')); return; }
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const row = (k: string, v: string) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.number)}</title><style>body{font-family:system-ui,sans-serif;margin:40px;color:#0F2A20;max-width:700px}h1{font-size:20px}h2{font-size:15px;margin-top:24px}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:left}</style></head><body>
      <h1>${esc(t('land.ddsTitle'))} · ${esc(s.number)}</h1><table>
      ${row(t('land.operator'), `${s.operator.name} (${s.operator.eori})`)}${row(t('land.address'), s.operator.address)}${row(t('col.commodity'), lk.commodity(s.commodityId))}${row(t('land.hsCode'), s.hsCode)}
      ${row(t('col.quantity'), f.kg(Math.round(s.kg)))}${row(t('land.country'), s.country)}${row(t('land.riskAssessment'), t(`land.risk.${s.risk}`))}${s.reference ? row(t('land.reference'), s.reference) : ''}</table>
      <h2>${esc(t('land.plotsGeo'))}</h2><table><tr><th>${esc(t('land.plotId'))}</th><th>${esc(t('land.area'))}</th><th>${esc(t('land.geometry'))}</th><th>${esc(t('land.eudrStatus'))}</th></tr>
      ${plots.map((p) => `<tr><td>${esc(p.code ?? p.id)}</td><td>${esc(area(p.areaHa))}</td><td>${esc(p.polygon.length ? `${p.polygon[0]![0].toFixed(6)}, ${p.polygon[0]![1].toFixed(6)} …` : '')}</td><td>${esc(t(`land.check.${p.check?.result ?? 'NOT_CHECKED'}`))}</td></tr>`).join('')}</table>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  return (
    <DetailDrawer open onClose={onClose} title={s.number} subtitle={`${dispatch?.number ?? '—'} · ${lk.commodity(s.commodityId)} · ${f.kg(Math.round(s.kg))}`}
      badges={<><Badge tone={s.status === 'SUBMITTED' ? 'done' : 'warning'}>{t(`land.ddsStatus.${s.status}`)}</Badge><Badge tone={s.risk === 'NEGLIGIBLE' ? 'success' : 'danger'}>{t(`land.risk.${s.risk}`)}</Badge>{s.reference && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[12px] text-brand">{s.reference}</span>}</>}
      actions={<>
        <Button size="sm" variant="secondary" onClick={download}><Download /> {t('land.downloadGeojson')}</Button>
        <Button size="sm" variant="secondary" onClick={print}><Printer /> {t('land.summaryPdf')}</Button>
        {s.status === 'DRAFT' && risk.length > 0 && <PermissionGate permission="eudr.generateDds"><Button size="sm" variant="dangerOutline" onClick={() => { excludePlots(s.id, risk.map((p) => p.id), userId ?? 'system'); toast.success(t('land.toast.excluded', { count: risk.length })); }}>{t('land.excludeRisk', { count: risk.length })}</Button></PermissionGate>}
        {s.status === 'DRAFT' && <PermissionGate permission="eudr.submitDds"><Button size="sm" disabled={submitting || risk.length > 0 || unchecked.length > 0} onClick={submit}>{submitting ? <Loader2 className="animate-spin" /> : <Send />} {submitting ? t('land.submitting') : t('land.submitTraces')}</Button></PermissionGate>}
      </>}
      tabs={[
        {
          key: 'summary', label: t('land.tab.summary'), content: (
            <div className="space-y-5">
              {s.status === 'DRAFT' && (risk.length > 0 || unchecked.length > 0) && <div className="rounded-ctl border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-ink" role="alert">{risk.length ? t('land.blockedRisk', { count: risk.length }) : t('land.blockedUnchecked', { count: unchecked.length })}</div>}
              <Facts items={[
                [t('land.operator'), s.operator.name || org.legalName], [t('land.eori'), s.operator.eori || '—'], [t('land.address'), s.operator.address || '—'], [t('land.country'), s.country],
                [t('col.commodity'), lk.commodity(s.commodityId)], [t('land.hsCode'), s.hsCode], [t('col.quantity'), `${f.kg(Math.round(s.kg))} · ${f.number(Math.round(s.kg / 100) / 10)} t`], [t('land.plotsCol'), f.number(plots.length)],
                [t('land.riskAssessment'), t(`land.risk.${s.risk}`)], [t('land.reference'), s.reference ?? '—'], [t('land.submittedOn'), s.submittedAt ? `${f.dateTime(s.submittedAt)} · ${lk.user(s.submittedBy ?? '')}` : '—'], [t('buy.created'), `${lk.user(s.createdBy)} · ${f.dateTime(s.createdAt)}`],
              ]} />
            </div>
          ),
        },
        {
          key: 'plots', label: t('land.plotsGeo'), count: plots.length, content: (
            <div className="space-y-4">
              <LandMap ariaLabel={t('land.plotsGeo')} height={300} shapes={plots.filter((p) => p.polygon.length >= 3).map((p) => plotShape(p, p.code ?? ''))} legend={(['CLEAR', 'RISK', 'NOT_CHECKED'] as const).map((x) => ({ label: t(`land.check.${x}`), color: CHECK_COLOR[x] }))} />
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">{plots.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2"><span><span className="font-mono text-ink">{p.code}</span> <span className="text-muted">{`· ${ll.farmerName(p.farmerId)} · ${area(p.areaHa)}`}</span></span><CheckBadge result={p.check?.result} /></li>)}</ul>
            </div>
          ),
        },
      ]} />
  );
}
