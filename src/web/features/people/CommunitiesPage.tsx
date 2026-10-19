import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, ListTree, Map as MapIcon, Pencil, Plus } from 'lucide-react';
import type { Community } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { usePageTour } from '@/components/shared/PageTour';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { AnswersView } from '@/components/forms/FormFields';
import { HBars, StackedColumns } from '@/components/charts/charts';
import { useLiveForm } from '@/services/formService';
import { pathLabel } from '@/engines/locations';
import { COMMUNITY_MODEL, communityScore } from '@/services/scoreService';
import { formatPhone } from '@/lib/format';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLocationStore } from '@/stores/locationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useRecordsStore } from '@/stores/recordsStore';
import { useActor, useCurrentOrg, useFormat, useLang, useOrgRows, useT } from '@/stores/hooks';
import { CommunityForm } from './CommunityForm';
import { ActivityFeed, DocumentsPanel, LeadersPanel, ScoreView, logActivity, useLookups } from './shared';

export const COMMUNITY_DOC_TYPES = ['membershipList', 'meetingRecords', 'contributionRecords', 'paymentRecords', 'partnershipAgreement', 'other'];
export const LEADER_ROLES = { en: ['Chief', 'Magazia (women leader)', 'Assembly member', 'Youth leader'], fr: ['Chef du village', 'Présidente des femmes', 'Notable', 'Président des jeunes'] };
type Band = '' | 'low' | 'mid' | 'high';
const band = (score: number): Exclude<Band, ''> => (score < 40 ? 'low' : score < 70 ? 'mid' : 'high');
const BAND_COLOR = { low: '#93A39B', mid: '#3FAF7E', high: '#14583F' };

function useCommunityRows() {
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const issues = useOrgRows(useQualityStore((s) => s.issues));
  return useMemo(() => {
    const count = <T,>(rows: T[], key: (r: T) => string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
      return m;
    };
    const farmersBy = count(farmers, (f) => f.communityId);
    const groupsBy = count(groups, (g) => g.communityId);
    const kgBy = new Map<string, number>();
    for (const p of purchases) kgBy.set(p.communityId, (kgBy.get(p.communityId) ?? 0) + p.quantity);
    const flagged = new Set(issues.filter((i) => i.entity === 'community' && (i.status === 'OPEN' || i.status === 'ASSIGNED')).map((i) => i.recordId));
    return communities.map((c) => ({
      ...c, path: pathLabel(nodes, c.locationNodeId), farmers: farmersBy.get(c.id) ?? 0, groups: groupsBy.get(c.id) ?? 0, kg: kgBy.get(c.id) ?? 0,
      flagged: flagged.has(c.id) || c.flags.length > 0,
      top: nodes.find((n) => n.id === c.locationNodeId)?.parentId ?? '',
    }));
  }, [communities, farmers, groups, purchases, nodes, issues]);
}
type Row = ReturnType<typeof useCommunityRows>[number];

/** Communities (PRD C2): list with filters and saved views, dashboard, drawer, create/edit. */
export function CommunitiesPage() {
  const org = useCurrentOrg();
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const rows = useCommunityRows();
  const lk = useLookups();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const [openId, openDrawer, closeDrawer] = useDrawerParam();
  const [form, setForm] = useState<{ community?: Community } | null>(null);
  const [q, setQ] = useState('');
  const [parent, setParent] = useState('');
  const [agent, setAgent] = useState('');
  const [score, setScore] = useState<Band>('');
  const [groups, setGroups] = useState('');
  const [view, setView] = useState<'all' | 'flagged' | 'noGroups' | 'notBought'>('all');
  const tour = usePageTour();
  const startTour = tour.start;
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, startTour);
    return () => window.removeEventListener(TOUR_EVENT, startTour);
  }, [startTour]);
  useDemoNotes([{ id: 'communities', key: 'demo.note.communities' }]);

  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (!query || r.name.toLowerCase().includes(query) || r.code.toLowerCase().includes(query) || r.path.toLowerCase().includes(query)) &&
    (!parent || r.top === parent) && (!agent || r.agentIds.includes(agent)) && (!score || band(r.score) === score) &&
    (!groups || (groups === 'yes' ? r.groups > 0 : r.groups === 0)) &&
    (view === 'all' || (view === 'flagged' && r.flagged) || (view === 'noGroups' && r.groups === 0) || (view === 'notBought' && r.kg === 0)),
  );
  const parents = useMemo(() => [...new Set(rows.map((r) => r.top))].map((id) => nodes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => !!n).sort((a, b) => a.name.localeCompare(b.name)), [rows, nodes]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'code', header: t('col.code'), accessorKey: 'code', cell: (c) => <span className="font-mono text-[13px] text-ink">{c.getValue() as string}</span> },
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'path', header: t('col.location'), accessorKey: 'path' },
    { id: 'population', header: t('col.population'), accessorKey: 'population', cell: (c) => f.number(c.getValue() as number) },
    { id: 'farmers', header: terms.farmers, accessorKey: 'farmers', cell: (c) => f.number(c.getValue() as number) },
    { id: 'groups', header: terms.farmerGroups, accessorKey: 'groups' },
    { id: 'agents', header: terms.agents, accessorFn: (r) => r.agentIds.map((a) => lk.agent(a)).join(', ') },
    { id: 'score', header: t('col.score'), accessorKey: 'score', cell: (c) => <ScoreChip score={c.getValue() as number} /> },
    { id: 'profiled', header: t('people.profiled'), accessorKey: 'profiledAt', cell: (c) => f.date(c.getValue() as string) },
    { id: 'flags', header: t('people.quality'), accessorKey: 'flagged', cell: (c) => (c.getValue() ? <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> {t('status.FLAGGED')}</Badge> : null) },
  ], [t, f, lk, terms]);

  const current = rows.find((r) => r.id === openId);
  return (
    <>
      {tour.element}
      <PageHeader
        eyebrow={t('nav.section.people')}
        title={terms.communities}
        description={t('pages.communities', { company: org.name })}
        onTour={startTour}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/app/locations')}><ListTree /> {t('nav.locations')}</Button>
            <Button variant="secondary" onClick={() => navigate('/app/communities/map')}><MapIcon /> {t('people.map')}</Button>
          </>
        }
        primary={<PermissionGate permission="communities.create"><Button onClick={() => setForm({})}><Plus /> {t('people.community.new')}</Button></PermissionGate>}
      />
      <Tabs defaultValue="list">
        <TabsList className="mb-5">
          <TabsTrigger value="list">{t('people.list')}</TabsTrigger>
          <TabsTrigger value="dashboard">{t('nav.dashboard')}</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <FilterBar
            search={q}
            onSearch={setQ}
            placeholder={t('people.searchCommunities')}
            views={(['all', 'flagged', 'noGroups', 'notBought'] as const).map((v) => ({ key: v, label: t(`people.view.${v}`), active: view === v, onSelect: () => setView(v) }))}
            filters={[
              { key: 'parent', label: t('col.location'), value: parent, onChange: setParent, options: parents.map((n) => ({ value: n.id, label: n.name })) },
              { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((r) => r.agentIds.includes(a.id))).map((a) => ({ value: a.id, label: lk.agent(a.id) })) },
              { key: 'score', label: t('col.score'), value: score, onChange: (v) => setScore(v as Band), options: (['low', 'mid', 'high'] as const).map((b) => ({ value: b, label: t(`people.band.${b}`) })) },
              { key: 'groups', label: t('people.hasGroups'), value: groups, onChange: setGroups, options: [{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }] },
            ]}
            onClear={() => { setQ(''); setParent(''); setAgent(''); setScore(''); setGroups(''); setView('all'); }}
          />
          <DataTable
            columns={columns}
            data={shown}
            onRowClick={(r) => openDrawer(r.id)}
            getRowId={(r) => r.id}
            activeId={openId}
            columnPicker
            initialHidden={['profiled']}
            exportCsv={{ fileName: `${org.code.toLowerCase()}-communities.csv`, columns: [
              { header: t('col.code'), value: (r) => r.code }, { header: t('col.name'), value: (r) => r.name }, { header: t('col.location'), value: (r) => r.path },
              { header: t('col.population'), value: (r) => r.population }, { header: terms.farmers, value: (r) => r.farmers }, { header: terms.farmerGroups, value: (r) => r.groups },
              { header: t('col.score'), value: (r) => r.score }, { header: t('people.profiled'), value: (r) => r.profiledAt.slice(0, 10) },
            ] }}
            empty={t('people.noMatch')}
          />
        </TabsContent>
        <TabsContent value="dashboard"><CommunityDashboard rows={rows} /></TabsContent>
      </Tabs>
      {current && <CommunityDrawer key={current.id} row={current} onClose={closeDrawer} onEdit={() => setForm({ community: current })} />}
      {form && <CommunityForm open onClose={(id) => { setForm(null); if (id) openDrawer(id); }} community={form.community} />}
    </>
  );
}

export function ScoreChip({ score }: { score: number }) {
  const b = band(score);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR[b] }} aria-hidden="true" />
      <span className="tnum font-medium text-ink">{Math.round(score)}</span>
    </span>
  );
}

function CommunityDrawer({ row, onClose, onEdit }: { row: Row; onClose: () => void; onEdit: () => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lang = useLang();
  const lk = useLookups();
  const navigate = useNavigate();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const leaders = useOrgRows(useRecordsStore((s) => s.leaders));
  const form = useLiveForm('communityProfile');
  const mine = useMemo(() => ({
    farmers: farmers.filter((x) => x.communityId === row.id),
    groups: groups.filter((g) => g.communityId === row.id),
    purchases: purchases.filter((p) => p.communityId === row.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }), [farmers, groups, purchases, row.id]);
  const breakdown = useMemo(() => communityScore(row, { purchases, leaders }), [row, purchases, leaders]);
  const recalc = () => {
    useCommunityStore.getState().saveCommunity({ ...useCommunityStore.getState().communities.find((c) => c.id === row.id)!, score: breakdown.total });
    logActivity(orgId, 'community', row.id, 'community.scored', { score: breakdown.total }, userId ?? 'system');
  };
  const byCommodity = new Map<string, number>();
  for (const p of mine.purchases) byCommodity.set(p.commodityId, (byCommodity.get(p.commodityId) ?? 0) + p.quantity);

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={row.name}
      subtitle={`${row.code} · ${row.path}`}
      badges={<><ScoreChip score={row.score} />{row.flagged && <Badge tone="warning">{t('status.FLAGGED')}</Badge>}</>}
      actions={<PermissionGate permission="communities.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
      tabs={[
        {
          key: 'overview', label: t('people.tab.overview'), content: (
            <div className="space-y-6">
              {row.gps && (
                <div className="h-48 overflow-hidden rounded-ctl border border-line">
                  <MapContainer center={[row.gps.lat, row.gps.lng]} zoom={11} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <CircleMarker center={[row.gps.lat, row.gps.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#14583F', fillOpacity: 1 }} />
                  </MapContainer>
                </div>
              )}
              <Facts items={[
                [t('col.code'), <span className="font-mono">{row.code}</span>], [t('col.population'), f.number(row.population)],
                [t('people.community.contact'), row.contactPerson.name], [t('people.phone'), formatPhone(row.contactPerson.phone)],
                [terms.agents, row.agentIds.map((a) => lk.agent(a)).join(', ') || '—'], [t('people.profiled'), f.date(row.profiledAt)],
                [terms.farmers, f.number(row.farmers)], [t('people.boughtKg'), f.kg(Math.round(row.kg))],
              ]} />
              <div>
                <h3 className="mb-3 text-[15px] font-semibold text-ink">{t('col.score')}</h3>
                <ScoreView model={COMMUNITY_MODEL} breakdown={breakdown} prefix="people.score.community" stored={row.score} onRecalculate={recalc} />
              </div>
            </div>
          ),
        },
        { key: 'profile', label: t('people.tab.profile'), content: <div className="space-y-3"><p className="text-[12px] text-muted">{form.name} · {t('set.forms.v', { n: form.version })}</p><AnswersView form={form} answers={row.customFields} /></div> },
        { key: 'leaders', label: t('people.tab.leaders'), content: <LeadersPanel entity="community" entityId={row.id} roles={LEADER_ROLES[lang]} permission="communities.edit" /> },
        { key: 'documents', label: t('people.tab.documents'), content: <DocumentsPanel entity="community" entityId={row.id} types={COMMUNITY_DOC_TYPES} permission="communities.edit" /> },
        {
          key: 'farmers', label: terms.farmers, count: mine.farmers.length, content: mine.farmers.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">
              {mine.farmers.slice(0, 50).map((x) => (
                <li key={x.id}><button type="button" onClick={() => navigate(`/app/farmers?open=${x.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas">
                  <span className="font-mono text-[12px] text-muted">{x.farmerCode}</span>
                  <span className="flex-1 text-[14px] text-ink">{x.firstName} {x.lastName}</span>
                  <span className="text-[12px] text-muted">{t(`gender.${x.gender}`)}</span>
                </button></li>
              ))}
            </ul>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        {
          key: 'groups', label: terms.farmerGroups, count: mine.groups.length, content: mine.groups.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">
              {mine.groups.map((g) => <li key={g.id}><button type="button" onClick={() => navigate(`/app/groups?open=${g.id}`)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] hover:bg-canvas"><span className="text-ink">{g.name}</span><span className="text-[12px] text-muted">{t(`groupType.${g.type}`)}</span></button></li>)}
            </ul>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        {
          key: 'purchases', label: t('nav.purchases'), count: mine.purchases.length, content: mine.purchases.length ? (
            <div className="space-y-4">
              <HBars data={[...byCommodity].map(([id, kg]) => ({ label: lk.commodity(id), value: Math.round(kg) }))} format={(v) => f.kg(v)} />
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
                {mine.purchases.slice(0, 20).map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2"><span className="font-mono text-muted">{p.number}</span><span className="flex-1">{lk.commodity(p.commodityId)} · {f.kg(p.quantity)}</span><span className="tnum text-ink">{f.money(p.amount)}</span></li>)}
              </ul>
            </div>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        { key: 'workshops', label: t('nav.workshops'), content: <TabEmpty>{t('people.laterPhase')}</TabEmpty> },
        { key: 'trees', label: t('people.tab.trees'), content: <TabEmpty>{t('people.laterPhase')}</TabEmpty> },
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="community" entityId={row.id} /> },
      ]}
    />
  );
}

function CommunityDashboard({ rows }: { rows: Row[] }) {
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.profiledAt.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([k, n]) => ({ label: f.date(`${k}-01`, 'MMM yy'), value: n }));
  }, [rows, f]);
  const bought = rows.filter((r) => r.kg > 0).length;
  const avg = rows.length ? rows.reduce((s, r) => s + r.farmers, 0) / rows.length : 0;
  const card = (label: string, value: string) => (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{label}</div><div className="tnum mt-2 text-[28px] font-semibold text-ink">{value}</div></div>
  );
  const topList = (title: string, list: Row[], value: (r: Row) => string) => (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <h3 className="mb-3 text-[15px] font-semibold text-ink">{title}</h3>
      <ol className="space-y-2">{list.map((r, i) => <li key={r.id}><button type="button" onClick={() => navigate(`/app/communities?open=${r.id}`)} className="flex w-full items-center gap-3 text-left text-[14px] hover:text-brand"><span className="tnum w-5 text-muted">{i + 1}</span><span className="flex-1 text-ink">{r.name}</span><span className="tnum text-body">{value(r)}</span></button></li>)}</ol>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {card(t('people.dash.profiled'), f.number(rows.length))}
        {card(t('people.dash.avgFarmers', { farmers: terms.farmers }), f.number(avg, { maximumFractionDigits: 1 }))}
        {card(t('people.dash.boughtFrom'), `${f.number(bought)} / ${f.number(rows.length)}`)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {topList(t('people.dash.topFarmers', { farmers: terms.farmers.toLocaleLowerCase() }), [...rows].sort((a, b) => b.farmers - a.farmers).slice(0, 3), (r) => f.number(r.farmers))}
        {topList(t('people.dash.topScore'), [...rows].sort((a, b) => b.score - a.score).slice(0, 3), (r) => f.number(r.score))}
      </div>
      <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <h3 className="mb-3 text-[15px] font-semibold text-ink">{t('people.dash.overTime')}</h3>
        <StackedColumns data={months.map((m) => ({ label: m.label, profiled: m.value }))} series={[{ key: 'profiled', label: t('people.dash.profiled'), index: 0 }]} format={(v) => f.number(v)} />
      </div>
    </div>
  );
}

/** Community map (PRD C2): score-coloured pins with filters; a pin opens the community. */
export function CommunitiesMapPage() {
  const { t, terms } = useT();
  const navigate = useNavigate();
  const rows = useCommunityRows();
  const lk = useLookups();
  const [agent, setAgent] = useState('');
  const [score, setScore] = useState<Band>('');
  const shown = rows.filter((r) => r.gps && (!agent || r.agentIds.includes(agent)) && (!score || band(r.score) === score));
  const bounds = shown.length ? ([[Math.min(...shown.map((r) => r.gps.lat)) - 0.05, Math.min(...shown.map((r) => r.gps.lng)) - 0.05], [Math.max(...shown.map((r) => r.gps.lat)) + 0.05, Math.max(...shown.map((r) => r.gps.lng)) + 0.05]] as [[number, number], [number, number]]) : null;
  return (
    <>
      <PageHeader eyebrow={terms.communities} title={t('people.mapTitle', { communities: terms.communities })} description={t('people.mapDesc')} actions={<Button variant="secondary" onClick={() => navigate('/app/communities')}>{t('people.list')}</Button>} />
      <FilterBar search="" onSearch={() => undefined} placeholder={t('people.searchCommunities')} filters={[
        { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((r) => r.agentIds.includes(a.id))).map((a) => ({ value: a.id, label: lk.agent(a.id) })) },
        { key: 'score', label: t('col.score'), value: score, onChange: (v) => setScore(v as Band), options: (['low', 'mid', 'high'] as const).map((b) => ({ value: b, label: t(`people.band.${b}`) })) },
      ]} onClear={() => { setAgent(''); setScore(''); }} />
      <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-body">
        {(['high', 'mid', 'low'] as const).map((b) => <span key={b} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: BAND_COLOR[b] }} />{t(`people.band.${b}`)} · {shown.filter((r) => band(r.score) === b).length}</span>)}
      </div>
      <div className="h-[calc(100vh-320px)] min-h-[420px] overflow-hidden rounded-card border border-line">
        {bounds ? (
          <MapContainer key={`${agent}${score}`} bounds={bounds} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {shown.map((r) => (
              <CircleMarker key={r.id} center={[r.gps.lat, r.gps.lng]} radius={7 + Math.min(6, r.farmers / 6)} eventHandlers={{ click: () => navigate(`/app/communities?open=${r.id}`) }} pathOptions={{ color: '#fff', weight: 2, fillColor: BAND_COLOR[band(r.score)], fillOpacity: 0.95 }} />
            ))}
          </MapContainer>
        ) : <TabEmpty>{t('people.noMatch')}</TabEmpty>}
      </div>
    </>
  );
}
