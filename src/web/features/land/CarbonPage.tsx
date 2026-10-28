import { useMemo, useState } from 'react';
import { CloudSun, Plus, Printer, Trees } from 'lucide-react';
import { toast } from 'sonner';
import type { CarbonProject } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { StatCard } from '@/components/shared/StatCard';
import { Field } from '@/components/shared/Field';
import { DetailDrawer, Facts, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { assignTreesToProject, createProject, projectStats, setCo2Factor } from '@/services/landService';
import { cn } from '@/lib/utils';
import { useLandStore } from '@/stores/landStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { ActivityFeed, useLookups } from '@/web/features/people/shared';
import { useLandLookups } from './shared';

const STANDARDS: CarbonProject['standard'][] = ['VERRA', 'GOLD_STANDARD', 'PLAN_VIVO', 'INTERNAL'];

/** Carbon projects (PRD I6): inside the company, trees assigned, survival and an estimated CO₂. */
export function CarbonPage() {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const projects = useOrgRows(useLandStore((s) => s.projects));
  const trees = useLandStore((s) => s.trees);
  const [openId, open, close] = useDrawerParam();
  const [creating, setCreating] = useState(false);
  const stats = useMemo(() => new Map(projects.map((p) => [p.id, projectStats(p, trees)])), [projects, trees]);
  const current = projects.find((p) => p.id === openId);
  const total = [...stats.values()].reduce((a, s) => ({ trees: a.trees + s.trees, alive: a.alive + s.alive, t: a.t + s.tPerYear }), { trees: 0, alive: 0, t: 0 });
  return (
    <>
      <PageHeader eyebrow={t('nav.section.trees')} title={t('nav.carbon')} description={t('pages.carbon')}
        primary={<PermissionGate permission="carbon.create"><Button onClick={() => setCreating(true)}><Plus /> {t('land.newProject')}</Button></PermissionGate>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('land.projects')} value={f.number(projects.length)} icon={CloudSun} />
        <StatCard label={t('land.treesInProjects')} value={f.number(total.trees)} hint={t('land.aliveN', { n: f.number(total.alive) })} icon={Trees} />
        <StatCard label={t('land.co2PerYear')} value={`${f.number(total.t, { maximumFractionDigits: 1 })} t`} hint={t('land.estimate')} />
      </div>
      {projects.length ? (
        <ul className="grid gap-4 lg:grid-cols-2">{projects.map((p) => {
          const s = stats.get(p.id)!;
          const target = p.speciesTargets.reduce((a, x) => a + x.target, 0);
          return (
            <li key={p.id}><button type="button" onClick={() => open(p.id)} className="w-full rounded-card border border-line bg-surface p-5 text-left shadow-soft hover:border-brand/40">
              <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-[12px] text-muted">{p.number}</div><div className="text-[17px] font-semibold text-ink">{p.name}</div><div className="text-[13px] text-muted">{`${t(`land.standard.${p.standard}`)} · ${p.partner?.name ?? '—'} · ${p.communityIds.map((c) => lk.community(c)).join(', ')}`}</div></div><Badge tone={p.status === 'ACTIVE' ? 'teal' : 'neutral'}>{t(`land.projectStatus.${p.status}`)}</Badge></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[13px]">
                <div><div className="text-muted">{t('land.trees')}</div><div className="tnum text-[18px] font-semibold text-ink">{`${f.number(s.trees)} / ${f.number(target)}`}</div></div>
                <div><div className="text-muted">{t('land.survivalPct')}</div><div className="tnum text-[18px] font-semibold text-ink">{`${f.number(s.survivalPct)}%`}</div></div>
                <div><div className="text-muted">{t('land.co2PerYear')}</div><div className="tnum text-[18px] font-semibold text-ink">{`${f.number(s.tPerYear, { maximumFractionDigits: 1 })} t`}</div></div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas" role="meter" aria-valuenow={target ? Math.round((s.trees / target) * 100) : 0} aria-valuemin={0} aria-valuemax={100} aria-label={t('land.towardTarget')}><div className="h-full rounded-full bg-brand" style={{ width: `${target ? Math.min(100, (s.trees / target) * 100) : 0}%` }} /></div>
            </button></li>
          );
        })}</ul>
      ) : <TabEmpty>{t('land.noProjects')}</TabEmpty>}
      {current && <ProjectDrawer key={current.id} project={current} onClose={close} />}
      {creating && <NewProjectSheet onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function ProjectDrawer({ project: p, onClose }: { project: CarbonProject; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const ll = useLandLookups();
  const org = useCurrentOrg();
  const trees = useLandStore((s) => s.trees);
  const s = projectStats(p, trees);
  const [assign, setAssign] = useState(false);
  const report = () => {
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) { toast.error(t('buy.popupBlocked')); return; }
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.number)}</title><style>body{font-family:system-ui,sans-serif;margin:40px;color:#0F2A20;max-width:700px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:6px 4px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:left}</style></head><body>
      <h1 style="font-size:20px">${esc(p.name)}</h1><div>${esc(org.legalName ?? org.name)} · ${esc(t(`land.standard.${p.standard}`))} · ${esc(p.partner?.name ?? '')}</div>
      <table><tr><td>${esc(t('land.trees'))}</td><td>${s.trees}</td></tr><tr><td>${esc(t('land.survivalPct'))}</td><td>${s.survivalPct}%</td></tr><tr><td>${esc(t('land.co2PerYear'))}</td><td>${s.tPerYear} t</td></tr><tr><td>${esc(t('land.co2ToDate'))}</td><td>${s.tToDate} t</td></tr><tr><td>${esc(t('land.baseline'))}</td><td>${p.baselineT} t</td></tr></table>
      <table><tr><th>${esc(t('land.species'))}</th><th>${esc(t('land.target'))}</th><th>${esc(t('land.assigned'))}</th><th>${esc(t('land.alive'))}</th></tr>${s.bySpecies.map((x) => `<tr><td>${esc(ll.speciesName(x.speciesId))}</td><td>${x.target}</td><td>${x.assigned}</td><td>${x.alive}</td></tr>`).join('')}</table>
      <p style="font-size:13px;margin-top:20px">${esc(p.monitoringPlan)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  return (
    <>
      <DetailDrawer open onClose={onClose} title={p.name} subtitle={`${p.number} · ${t(`land.standard.${p.standard}`)} · ${t('land.since', { date: f.date(p.startDate) })}`}
        badges={<Badge tone="teal">{t(`land.projectStatus.${p.status}`)}</Badge>}
        actions={<><PermissionGate permission="carbon.update"><Button size="sm" onClick={() => setAssign(true)}><Trees /> {t('land.assignTrees')}</Button></PermissionGate><Button size="sm" variant="secondary" onClick={report}><Printer /> {t('land.report')}</Button></>}
        tabs={[
          {
            key: 'overview', label: t('land.tab.overview'), content: (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([[t('land.trees'), f.number(s.trees)], [t('land.survivalPct'), `${f.number(s.survivalPct)}%`], [t('land.co2PerYear'), `${f.number(s.tPerYear, { maximumFractionDigits: 1 })} t`], [t('land.co2ToDate'), `${f.number(s.tToDate, { maximumFractionDigits: 1 })} t`]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[18px] font-semibold text-ink">{v}</div></div>)}</div>
                <Facts items={[
                  [t('land.standardCol'), t(`land.standard.${p.standard}`)], [t('land.partner'), p.partner?.name ?? '—'], [t('land.baseline'), `${f.number(p.baselineT)} tCO₂e`], [t('land.startDate'), f.date(p.startDate)],
                  [t('land.communities'), p.communityIds.map((c) => lk.community(c)).join(', ')], [t('land.plotsCol'), f.number(p.plotIds.length)],
                ]} />
                <div><h4 className="mb-1 text-[13px] font-semibold text-ink">{t('land.monitoringPlan')}</h4><p className="text-[14px] text-body">{p.monitoringPlan}</p></div>
              </div>
            ),
          },
          {
            key: 'species', label: t('land.tab.species'), count: p.speciesTargets.length, content: (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">{t('land.co2Hint')}</p>
                <div className="overflow-x-auto rounded-ctl border border-line">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead><tr className="border-b border-line bg-canvas text-left text-[12px] text-label">{[t('land.species'), t('land.target'), t('land.assigned'), t('land.alive'), t('land.co2Factor')].map((h, i) => <th key={h} className={cn('px-3 py-2 font-semibold', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
                    <tbody>{s.bySpecies.map((x) => (
                      <tr key={x.speciesId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-ink">{ll.speciesName(x.speciesId)}</td><td className="tnum px-3 py-2 text-right">{f.number(x.target)}</td><td className="tnum px-3 py-2 text-right">{f.number(x.assigned)}</td><td className="tnum px-3 py-2 text-right">{f.number(x.alive)}</td>
                        <td className="px-3 py-2 text-right"><PermissionGate permission="carbon.update"><Input type="number" className="ml-auto h-9 w-24 text-right" value={p.co2Factors[x.speciesId] ?? 0} onChange={(e) => setCo2Factor(p.id, x.speciesId, Number(e.target.value) || 0)} aria-label={t('land.co2FactorFor', { species: ll.speciesName(x.speciesId) })} /></PermissionGate></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ),
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="carbonProject" entityId={p.id} /> },
        ]} />
      {assign && <AssignTreesDialog project={p} onClose={() => setAssign(false)} />}
    </>
  );
}

function AssignTreesDialog({ project: p, onClose }: { project: CarbonProject; onClose: () => void }) {
  const { t } = useT();
  const ll = useLandLookups();
  const { userId } = useActor();
  const trees = useLandStore((s) => s.trees);
  const [speciesId, setSpeciesId] = useState(p.speciesTargets[0]?.speciesId ?? '');
  const free = trees.filter((x) => x.orgId === p.orgId && !x.projectId && x.speciesId === speciesId && x.state === 'ALIVE' && p.communityIds.includes(x.communityId)).length;
  const [qty, setQty] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('land.assignTrees')}</DialogTitle><DialogDescription>{t('land.assignTreesHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('land.species')}><select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} aria-label={t('land.species')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px]">{p.speciesTargets.map((x) => <option key={x.speciesId} value={x.speciesId}>{ll.speciesName(x.speciesId)}</option>)}</select></Field>
          <Field label={t('col.quantity')} helper={t('land.availableN', { n: free })}><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={t('col.quantity')} /></Field>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!(Number(qty) > 0) || Number(qty) > free} onClick={() => { const n = assignTreesToProject(p.id, speciesId, Number(qty), userId ?? 'system'); toast.success(t('land.toast.treesAssigned', { n })); onClose(); }}>{t('land.assign')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewProjectSheet({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const ll = useLandLookups();
  const [v, setV] = useState({ name: '', standard: 'INTERNAL' as CarbonProject['standard'], startDate: new Date().toISOString().slice(0, 10), baselineT: '', partner: '', plan: '' });
  const [communities, setCommunities] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const speciesTargets = Object.entries(targets).filter(([, n]) => Number(n) > 0).map(([speciesId, n]) => ({ speciesId, target: Number(n) }));
  const invalid = !v.name.trim() || !communities.length || !speciesTargets.length;
  const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('land.newProject')}</SheetTitle><p className="mt-1 text-[13px] text-muted">{t('land.projectInsideHint')}</p></div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label={t('land.projectName')}><Input value={v.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('land.projectName')} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('land.standardCol')}><select value={v.standard} onChange={(e) => set({ standard: e.target.value as CarbonProject['standard'] })} aria-label={t('land.standardCol')} className={select}>{STANDARDS.map((s) => <option key={s} value={s}>{t(`land.standard.${s}`)}</option>)}</select></Field>
            <Field label={t('land.startDate')}><Input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} aria-label={t('land.startDate')} /></Field>
            <Field label={t('land.baselineT')}><Input type="number" value={v.baselineT} onChange={(e) => set({ baselineT: e.target.value })} aria-label={t('land.baselineT')} /></Field>
          </div>
          <Field label={t('land.partner')} helper={t('land.partnerHint')}><Input value={v.partner} onChange={(e) => set({ partner: e.target.value })} aria-label={t('land.partner')} /></Field>
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-label">{t('land.communities')}</legend><div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">{lk.communities.map((c) => <button key={c.id} type="button" aria-pressed={communities.includes(c.id)} onClick={() => setCommunities(communities.includes(c.id) ? communities.filter((x) => x !== c.id) : [...communities, c.id])} className={cn('rounded-chip border px-3 py-1.5 text-[13px]', communities.includes(c.id) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-body')}>{c.name}</button>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-label">{t('land.speciesTargets')}</legend><div className="grid gap-2 sm:grid-cols-2">{ll.species.map((s) => <Field key={s.id} label={ll.speciesName(s.id)}><Input type="number" value={targets[s.id] ?? ''} onChange={(e) => setTargets({ ...targets, [s.id]: e.target.value })} aria-label={t('land.targetFor', { species: ll.speciesName(s.id) })} /></Field>)}</div></fieldset>
          <Field label={t('land.monitoringPlan')}><textarea value={v.plan} onChange={(e) => set({ plan: e.target.value })} rows={3} aria-label={t('land.monitoringPlan')} className="w-full rounded-ctl border border-line bg-surface px-3 py-2 text-[14px]" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4"><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={() => { const p = createProject({ orgId, name: v.name.trim(), standard: v.standard, startDate: v.startDate, baselineT: Number(v.baselineT) || 0, speciesTargets, communityIds: communities, monitoringPlan: v.plan.trim(), partner: v.partner.trim() ? { name: v.partner.trim() } : undefined, actorId: userId ?? 'system' }); toast.success(t('land.toast.project', { name: p.name })); onClose(p.id); }}>{t('common.save')}</Button></div>
      </SheetContent>
    </Sheet>
  );
}
