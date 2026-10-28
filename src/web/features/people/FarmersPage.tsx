import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, CreditCard, Fingerprint, Pencil, Plus, ShieldCheck, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Farmer, LoanAccount } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { Avatar } from '@/components/shared/Avatar';
import { DataTable, downloadCsv } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { usePageTour } from '@/components/shared/PageTour';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { AnswersView, answerText } from '@/components/forms/FormFields';
import { qLabel } from '@/components/forms/QuestionInput';
import { allQuestions } from '@/engines/forms';
import { Donut, HBars, StackedColumns } from '@/components/charts/charts';
import { useLiveForm } from '@/services/formService';
import { buildLedger } from '@/engines/loans';
import { FARMER_MODEL, farmerScore } from '@/services/scoreService';
import { formatPhone } from '@/lib/format';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { useActivityStore } from '@/stores/activityStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLandStore } from '@/stores/landStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { farmerTrainings } from '@/services/trainingService';
import { TreeList } from '@/web/features/land/shared';
import { WorkshopList } from '@/web/features/training/WorkshopsPage';
import { useLoanStore } from '@/stores/loanStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useActor, useCurrentOrg, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ScoreChip } from './CommunitiesPage';
import { FarmerForm } from './FarmerForm';
import { ActivityFeed, DocumentsPanel, ScoreView, logActivity, useLookups } from './shared';
import { ruleLabel } from './quality';

const ageOf = (dob: string, now = Date.now()) => Math.floor((now - new Date(dob).getTime()) / 31_557_600_000);
export const AGE_BANDS: [number, number][] = [[18, 29], [30, 44], [45, 59], [60, 120]];
type View = 'all' | 'women' | 'noConsent' | 'debt' | 'flagged';

function loanBalance(l: LoanAccount, terms: Parameters<typeof buildLedger>[1]) {
  if (l.status !== 'ACTIVE') return 0;
  return buildLedger(l.principal, terms, l.window, l.repayments.map((r) => ({ date: r.date, amountMinor: r.amount.amountMinor, mode: r.mode })), new Date(), { disbursedAt: l.disbursedAt }).balance;
}

function useFarmerRows() {
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const memberships = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const loans = useOrgRows(useLoanStore((s) => s.loans));
  const issues = useOrgRows(useQualityStore((s) => s.issues));
  const settings = useOrgSettings();
  const lk = useLookups();
  return useMemo(() => {
    const now = Date.now();
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    const groupsOf = new Map<string, string[]>();
    for (const m of memberships) if (!m.leftAt) groupsOf.set(m.farmerId, [...(groupsOf.get(m.farmerId) ?? []), groupName.get(m.groupId) ?? '']);
    const owed = new Map<string, number>();
    for (const l of loans) owed.set(l.farmerId, (owed.get(l.farmerId) ?? 0) + loanBalance(l, settings.loanTerms));
    const active = new Map<string, string[]>();
    for (const i of issues) if (i.entity === 'farmer' && (i.status === 'OPEN' || i.status === 'ASSIGNED')) active.set(i.recordId, [...(active.get(i.recordId) ?? []), i.ruleId]);
    return farmers.map((f) => ({
      ...f, name: `${f.firstName} ${f.lastName}`, age: ageOf(f.dateOfBirth, now), community: lk.community(f.communityId), agent: lk.agent(f.agentId),
      groupNames: groupsOf.get(f.id) ?? [], owed: owed.get(f.id) ?? 0, issueRules: active.get(f.id) ?? [],
    }));
  }, [farmers, memberships, groups, loans, issues, settings.loanTerms, lk]);
}
export type FarmerRow = ReturnType<typeof useFarmerRows>[number];

const Tick = ({ on, label }: { on: boolean; label: string }) => (on ? <Check className="h-4 w-4 text-success" aria-label={label} /> : <X className="h-4 w-4 text-muted/60" aria-label={label} />);

/** Farmers (PRD C3): list, saved views, register, detail drawer, dashboard and exports. */
export function FarmersPage() {
  const org = useCurrentOrg();
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const rows = useFarmerRows();
  const lk = useLookups();
  const lang = useLang();
  const liveForm = useLiveForm('farmerProfile');
  const [openId, openDrawer, closeDrawer] = useDrawerParam();
  const [form, setForm] = useState<{ farmer?: Farmer } | null>(null);
  const [q, setQ] = useState('');
  const [community, setCommunity] = useState('');
  const [agent, setAgent] = useState('');
  const [gender, setGender] = useState('');
  const [quality, setQuality] = useState('');
  const [view, setView] = useState<View>('all');
  const tour = usePageTour();
  const startTour = tour.start;
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, startTour);
    return () => window.removeEventListener(TOUR_EVENT, startTour);
  }, [startTour]);
  useDemoNotes([{ id: 'farmers', key: 'demo.note.farmers' }]);

  const query = q.trim().toLowerCase();
  const inView = (r: FarmerRow, v: View) => v === 'all' || (v === 'women' && r.gender === 'F') || (v === 'noConsent' && !r.identity.consent) || (v === 'debt' && r.owed > 0) || (v === 'flagged' && r.qualityStatus === 'FLAGGED');
  const shown = rows.filter((r) =>
    (!query || r.name.toLowerCase().includes(query) || r.farmerCode.toLowerCase().includes(query) || r.phone.includes(query.replace(/\s/g, ''))) &&
    (!community || r.communityId === community) && (!agent || r.agentId === agent) && (!gender || r.gender === gender) && (!quality || r.qualityStatus === quality) && inView(r, view),
  );

  const columns = useMemo<ColumnDef<FarmerRow, unknown>[]>(() => [
    { id: 'photo', header: '', enableSorting: false, cell: (c) => <Avatar name={c.row.original.name} color={c.row.original.identity.photo ? '#3FAF7E' : '#93A39B'} size={30} /> },
    { id: 'code', header: t('people.farmer.id'), accessorKey: 'farmerCode', cell: (c) => <span className="font-mono text-[13px] text-ink">{c.getValue() as string}</span> },
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'gender', header: t('col.gender'), accessorKey: 'gender', cell: (c) => t(`gender.${c.getValue() as string}`) },
    { id: 'age', header: t('people.farmer.age'), accessorKey: 'age' },
    { id: 'community', header: terms.community, accessorKey: 'community' },
    { id: 'phone', header: t('people.phone'), accessorKey: 'phone', cell: (c) => <span className="whitespace-nowrap">{formatPhone(c.getValue() as string)}</span> },
    { id: 'crop', header: t('people.farmer.crop'), accessorFn: (r) => lk.commodity(r.primaryCrop) },
    { id: 'group', header: terms.farmerGroup, accessorFn: (r) => r.groupNames.join(', ') },
    { id: 'agent', header: terms.agent, accessorKey: 'agent' },
    { id: 'score', header: t('col.score'), accessorKey: 'score', cell: (c) => <ScoreChip score={c.getValue() as number} /> },
    { id: 'consent', header: t('people.farmer.consent'), accessorFn: (r) => !!r.identity.consent, cell: (c) => <Tick on={c.getValue() as boolean} label={t('people.farmer.consent')} /> },
    { id: 'thumb', header: t('people.farmer.thumb'), accessorFn: (r) => r.identity.thumbprints.left && r.identity.thumbprints.right, cell: (c) => <Tick on={c.getValue() as boolean} label={t('people.farmer.thumb')} /> },
    { id: 'nfc', header: t('people.farmer.nfc'), accessorFn: (r) => r.identity.nfcCard?.status === 'ISSUED' || r.identity.nfcCard?.status === 'REPLACED', cell: (c) => <Tick on={c.getValue() as boolean} label={t('people.farmer.nfc')} /> },
    { id: 'quality', header: t('people.quality'), accessorKey: 'qualityStatus', cell: (c) => (c.getValue() === 'FLAGGED' ? <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> {c.row.original.issueRules.length || ''}</Badge> : <Badge tone="success">{t('status.OK')}</Badge>) },
    { id: 'owed', header: t('people.farmer.owed'), accessorKey: 'owed', cell: (c) => ((c.getValue() as number) > 0 ? <span className="tnum whitespace-nowrap text-ink">{f.money({ amountMinor: c.getValue() as number, currency: org.currency })}</span> : <span className="text-muted">—</span>) },
    // Every question of the live farmer profile form is a column option (PRD Journey 9).
    ...allQuestions(liveForm).filter((q) => !['note', 'repeatGroup', 'table', 'image', 'audio', 'video', 'file', 'signature', 'gpsPolygon'].includes(q.type)).map((q): ColumnDef<FarmerRow, unknown> => ({
      id: `cf_${q.id}`, header: qLabel(q, lang), accessorFn: (r) => answerText(q, r.customFields[q.id], t, lang),
    })),
  ], [t, f, lk, terms, org.currency, liveForm, lang]);

  const exportProfiling = () => {
    const byAgent = new Map<string, FarmerRow[]>();
    for (const r of rows) byAgent.set(r.agentId, [...(byAgent.get(r.agentId) ?? []), r]);
    const data = [...byAgent].map(([id, list]) => [lk.agent(id), list.length, list.filter((r) => r.gender === 'F').length, list.filter((r) => r.identity.consent).length, list.filter((r) => r.identity.thumbprints.left && r.identity.thumbprints.right).length, list.filter((r) => r.qualityStatus === 'FLAGGED').length]);
    downloadCsv(`${org.code.toLowerCase()}-farmer-profiling-by-agent.csv`, [terms.agent, terms.farmers, t('people.dash.women'), t('people.farmer.consent'), t('people.farmer.thumb'), t('status.FLAGGED')], data);
  };

  const current = rows.find((r) => r.id === openId);
  return (
    <>
      {tour.element}
      <PageHeader
        eyebrow={t('nav.section.people')}
        title={terms.farmers}
        description={t('pages.farmers', { company: org.name })}
        onTour={startTour}
        actions={
          <>
            <PermissionGate permission="imports.view"><Button variant="secondary" onClick={() => navigate('/app/imports?type=farmers')}><Upload /> {t('nav.imports')}</Button></PermissionGate>
            <Button variant="secondary" onClick={exportProfiling}>{t('people.farmer.profilingReport')}</Button>
          </>
        }
        primary={<PermissionGate permission="farmers.create"><Button onClick={() => setForm({})}><Plus /> {t('people.farmer.new', { farmer: terms.farmer.toLocaleLowerCase() })}</Button></PermissionGate>}
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
            placeholder={t('people.searchFarmers')}
            views={(['all', 'women', 'noConsent', 'debt', 'flagged'] as const).map((v) => ({ key: v, label: t(`people.farmerView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v)).length }))}
            filters={[
              { key: 'community', label: terms.community, value: community, onChange: setCommunity, options: [...lk.communities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })) },
              { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((r) => r.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })) },
              { key: 'gender', label: t('col.gender'), value: gender, onChange: setGender, options: (['F', 'M'] as const).map((g) => ({ value: g, label: t(`gender.${g}`) })) },
              { key: 'quality', label: t('people.quality'), value: quality, onChange: setQuality, options: (['OK', 'FLAGGED'] as const).map((s) => ({ value: s, label: t(`status.${s}`) })) },
            ]}
            onClear={() => { setQ(''); setCommunity(''); setAgent(''); setGender(''); setQuality(''); setView('all'); }}
          />
          <DataTable
            columns={columns}
            data={shown}
            onRowClick={(r) => openDrawer(r.id)}
            getRowId={(r) => r.id}
            activeId={openId}
            columnPicker
            initialHidden={['crop', 'thumb', 'nfc']}
            hiddenByDefault={(id) => id.startsWith('cf_')}
            exportCsv={{ fileName: `${org.code.toLowerCase()}-farmers.csv`, columns: [
              { header: t('people.farmer.id'), value: (r) => r.farmerCode }, { header: t('people.farmer.firstName'), value: (r) => r.firstName }, { header: t('people.farmer.lastName'), value: (r) => r.lastName },
              { header: t('col.gender'), value: (r) => r.gender }, { header: t('people.farmer.dob'), value: (r) => r.dateOfBirth }, { header: terms.community, value: (r) => r.community },
              { header: t('people.phone'), value: (r) => r.phone }, { header: terms.agent, value: (r) => r.agent }, { header: t('col.score'), value: (r) => r.score },
              { header: t('people.farmer.consent'), value: (r) => (r.identity.consent ? 1 : 0) }, { header: t('people.quality'), value: (r) => r.qualityStatus },
            ] }}
            empty={t('people.noMatch')}
          />
        </TabsContent>
        <TabsContent value="dashboard"><FarmerDashboard rows={rows} /></TabsContent>
      </Tabs>
      {current && <FarmerDrawer key={current.id} row={current} onClose={closeDrawer} onEdit={() => setForm({ farmer: current })} />}
      {form && <FarmerForm open onClose={(id) => { setForm(null); if (id) openDrawer(id); }} farmer={form.farmer} onOpenFarmer={openDrawer} />}
    </>
  );
}

function FarmerDrawer({ row, onClose, onEdit }: { row: FarmerRow; onClose: () => void; onEdit: () => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const navigate = useNavigate();
  const org = useCurrentOrg();
  const settings = useOrgSettings();
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const payments = useOrgRows(usePaymentStore((s) => s.payments));
  const loans = useOrgRows(useLoanStore((s) => s.loans));
  const memberships = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const issues = useOrgRows(useQualityStore((s) => s.issues));
  const activity = useActivityStore((s) => s.activity);
  const form = useLiveForm('farmerProfile');
  const workshops = useOrgRows(useTrainingStore((s) => s.workshops));
  const trees = useOrgRows(useLandStore((s) => s.trees));
  const mine = useMemo(() => {
    const ps = purchases.filter((p) => p.farmerId === row.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const ids = new Set(ps.map((p) => p.id));
    return {
      purchases: ps,
      payments: payments.filter((p) => ids.has(p.payableId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      loans: loans.filter((l) => l.farmerId === row.id),
      memberships: memberships.filter((m) => m.farmerId === row.id),
      issues: issues.filter((i) => i.entity === 'farmer' && i.recordId === row.id && (i.status === 'OPEN' || i.status === 'ASSIGNED')),
      versions: activity.filter((e) => e.entity === 'farmer' && e.entityId === row.id && (e.key === 'farmer.updated' || e.key === 'farmer.registered')).sort((a, b) => b.at.localeCompare(a.at)),
      trainings: farmerTrainings(row.id, workshops),
      trees: trees.filter((x) => x.farmerId === row.id),
    };
  }, [purchases, payments, loans, memberships, issues, activity, workshops, trees, row.id]);
  const breakdown = useMemo(() => farmerScore(row, { purchases, memberships, loans }), [row, purchases, memberships, loans]);
  const rules = settings.qualityRules;
  const update = (patch: Partial<Farmer>, key: string, params: Record<string, unknown> = {}) => {
    const cur = useFarmerStore.getState().farmers.find((x) => x.id === row.id)!;
    useFarmerStore.getState().saveFarmer({ ...cur, ...patch, updatedAt: new Date().toISOString() });
    logActivity(orgId, 'farmer', row.id, key, params, userId ?? 'system');
  };
  const issueCard = () => {
    const number = `NFC-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
    update({ identity: { ...row.identity, nfcCard: { number, status: row.identity.nfcCard ? 'REPLACED' : 'ISSUED' } } }, 'farmer.cardIssued', { number });
    toast.success(t('people.farmer.cardIssued', { number }));
  };
  const byCommodity = new Map<string, number>();
  for (const p of mine.purchases) byCommodity.set(p.commodityId, (byCommodity.get(p.commodityId) ?? 0) + p.quantity);
  const consent = row.identity.consent;

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={row.name}
      subtitle={`${row.farmerCode} · ${row.community} · ${t(`gender.${row.gender}`)}, ${row.age}`}
      badges={
        <>
          <ScoreChip score={row.score} />
          {row.qualityStatus === 'FLAGGED' ? <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> {t('status.FLAGGED')}</Badge> : <Badge tone="success"><ShieldCheck className="h-3 w-3" /> {t('people.farmer.clean')}</Badge>}
          {row.owed > 0 && <Badge tone="danger">{t('people.farmer.owesBadge', { amount: f.money({ amountMinor: row.owed, currency: org.currency }) })}</Badge>}
          <Badge tone="neutral">{t('people.farmer.version', { n: row.version })}</Badge>
        </>
      }
      actions={<PermissionGate permission="farmers.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
      tabs={[
        {
          key: 'profile', label: t('people.tab.profile'), content: (
            <div className="space-y-6">
              {mine.issues.length > 0 && (
                <div className="rounded-ctl border border-warning/40 bg-warning/10 px-4 py-3" role="status">
                  <div className="text-[14px] font-medium text-ink">{t('people.farmer.qualityReasons', { count: mine.issues.length })}</div>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-body">{mine.issues.map((i) => <li key={i.id}>{ruleLabel(rules.find((r) => r.id === i.ruleId), t)} · {t(`dq.status.${i.status}`)}</li>)}</ul>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => navigate(`/app/data-quality?record=${row.id}`)}>{t('people.farmer.resolve')}</Button>
                </div>
              )}
              <Facts items={[
                [t('people.farmer.id'), <span className="font-mono">{row.farmerCode}</span>], [t('people.phone'), formatPhone(row.phone) || '—'],
                [t('people.farmer.dob'), `${f.date(row.dateOfBirth)} · ${row.age}`], [terms.community, row.community],
                [terms.agent, row.agent], [t('people.farmer.registered'), f.date(row.registeredAt)], [t('people.farmer.crop'), lk.commodity(row.primaryCrop)],
                [terms.farmerGroup, row.groupNames.join(', ') || '—'],
              ]} />
              <div>
                <p className="mb-3 text-[12px] text-muted">{form.name} · {t('set.forms.v', { n: form.version })}</p>
                <AnswersView form={form} answers={row.customFields} />
              </div>
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-ink">{t('people.farmer.history')}</h3>
                {mine.versions.length ? (
                  <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
                    {mine.versions.map((e) => <li key={e.id} className="px-4 py-2"><span className="text-ink">{t(`activity.${e.key}`, e.params)}</span><span className="block text-[12px] text-muted">{lk.user(e.actorId)} · {f.dateTime(e.at)}</span></li>)}
                  </ul>
                ) : <p className="text-[13px] text-muted">{t('people.farmer.noHistory', { version: row.version })}</p>}
              </div>
            </div>
          ),
        },
        {
          key: 'identity', label: t('people.tab.identity'), content: (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {([['photo', row.identity.photo], ['idCard', row.identity.idCard]] as const).map(([k, on]) => (
                  <div key={k} className="flex items-center gap-3 rounded-ctl border border-line p-4">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-ctl ${on ? 'bg-brand-soft text-brand' : 'bg-canvas text-muted'}`}>{k === 'photo' ? <Avatar name={row.name} color={on ? '#14583F' : '#93A39B'} size={44} /> : <CreditCard className="h-6 w-6" />}</span>
                    <div><div className="text-[14px] font-medium text-ink">{t(`people.farmer.${k}`)}</div><div className="text-[12px] text-muted">{on ? t('people.farmer.captured') : t('people.farmer.missing')}</div></div>
                  </div>
                ))}
              </div>
              <div className="rounded-ctl border border-line p-4">
                <div className="mb-2 flex items-center gap-2 text-[14px] font-medium text-ink"><Fingerprint className="h-4 w-4 text-brand" /> {t('people.farmer.thumbprints')}</div>
                <div className="flex gap-6 text-[13px]">
                  {(['left', 'right'] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><Tick on={row.identity.thumbprints[s]} label={t(`people.farmer.${s}`)} />{t(`people.farmer.${s}`)}</span>)}
                </div>
              </div>
              <div className="rounded-ctl border border-line p-4">
                <div className="mb-1 text-[14px] font-medium text-ink">{t('people.farmer.consent')}</div>
                {consent ? (
                  <div className="space-y-2 text-[13px] text-body">
                    <div>{t(`people.farmer.consentType.${consent.type}`)} · {f.dateTime(consent.capturedAt)}</div>
                    {consent.type === 'AUDIO' && <div className="flex items-center gap-3 rounded-full bg-canvas px-4 py-2"><button type="button" onClick={() => toast(t('people.farmer.audioDemo'))} className="h-7 w-7 rounded-full bg-brand text-white" aria-label={t('people.farmer.play')}>{'▶'}</button><div className="h-1 flex-1 rounded-full bg-line"><div className="h-1 w-1/3 rounded-full bg-brand" /></div><span className="tnum text-muted">{'0:14'}</span></div>}
                    {consent.type === 'SIGNATURE' && <svg viewBox="0 0 200 50" className="h-14 w-48 rounded-ctl border border-line bg-surface" aria-label={t('people.farmer.signature')}><path d="M10 35 C 30 5, 45 45, 60 25 S 90 10, 105 30 S 140 40, 150 20 S 180 30, 190 25" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink" /></svg>}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
                    {t('people.farmer.noConsent')}
                    <PermissionGate permission="farmers.edit"><Button size="sm" variant="secondary" onClick={() => update({ identity: { ...row.identity, consent: { type: 'TICK', capturedAt: new Date().toISOString() } } }, 'farmer.consentRecorded')}>{t('people.farmer.recordConsent')}</Button></PermissionGate>
                  </div>
                )}
              </div>
              {settings.biometrics.nfcCards && (
                <div className="rounded-ctl border border-line p-4">
                  <div className="mb-2 text-[14px] font-medium text-ink">{t('people.farmer.nfcCard')}</div>
                  {row.identity.nfcCard ? (
                    <div className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="font-mono text-ink">{row.identity.nfcCard.number}</span>
                      <Badge tone={row.identity.nfcCard.status === 'REVOKED' ? 'danger' : 'success'}>{t(`people.farmer.cardStatus.${row.identity.nfcCard.status}`)}</Badge>
                    </div>
                  ) : <p className="text-[13px] text-muted">{t('people.farmer.noCard')}</p>}
                  <PermissionGate permission="farmers.manageNfc">
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={issueCard}>{row.identity.nfcCard ? t('people.farmer.replaceCard') : t('people.farmer.issueCard')}</Button>
                      {row.identity.nfcCard && row.identity.nfcCard.status !== 'REVOKED' && <Button size="sm" variant="ghost" onClick={() => update({ identity: { ...row.identity, nfcCard: { ...row.identity.nfcCard!, status: 'REVOKED' } } }, 'farmer.cardRevoked', { number: row.identity.nfcCard!.number })}>{t('people.farmer.revokeCard')}</Button>}
                    </div>
                  </PermissionGate>
                </div>
              )}
              <DocumentsPanel entity="farmer" entityId={row.id} types={['idCard', 'photo', 'landDocument', 'other']} permission="farmers.edit" />
            </div>
          ),
        },
        {
          key: 'purchases', label: t('nav.purchases'), count: mine.purchases.length, content: mine.purchases.length ? (
            <div className="space-y-4">
              <HBars data={[...byCommodity].map(([id, kg]) => ({ label: lk.commodity(id), value: Math.round(kg) }))} format={(v) => f.kg(v)} />
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
                {mine.purchases.slice(0, 30).map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2"><span className="font-mono text-muted">{p.number}</span><span className="flex-1">{lk.commodity(p.commodityId)} · {f.kg(p.quantity)} · {f.date(p.createdAt)}</span><span className="tnum text-ink">{f.money(p.amount)}</span></li>)}
              </ul>
            </div>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        {
          key: 'payments', label: t('nav.payments'), count: mine.payments.length, content: mine.payments.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
              {mine.payments.map((p) => <li key={p.id} className="flex items-center gap-3 px-4 py-2"><span className="font-mono text-muted">{p.reference}</span><span className="flex-1">{f.date(p.createdAt)}</span><Badge tone={p.status === 'SUCCESSFUL' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{t(`status.${p.status}`)}</Badge><span className="tnum text-ink">{f.money(p.amount)}</span></li>)}
            </ul>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        {
          key: 'loans', label: t('people.tab.loans'), count: mine.loans.length, content: mine.loans.length ? (
            <ul className="space-y-3">
              {mine.loans.map((l) => {
                const bal = loanBalance(l, settings.loanTerms);
                return (
                  <li key={l.id} className="rounded-ctl border border-line p-4 text-[13px]">
                    <div className="flex items-center justify-between"><span className="font-medium text-ink">{t('people.farmer.loan', { amount: f.money(l.principal) })}</span><Badge tone={l.status === 'ACTIVE' ? 'warning' : 'success'}>{t(`people.farmer.loanStatus.${l.status}`)}</Badge></div>
                    <div className="mt-1 text-muted">{t('people.farmer.loanWindow', { from: f.date(l.window.start), to: f.date(l.window.end) })} · {t('people.farmer.repayments', { count: l.repayments.length })}</div>
                    <div className="mt-2 text-[15px] text-ink">{t('people.farmer.balance')}: <span className="tnum font-semibold">{f.money({ amountMinor: bal, currency: l.principal.currency })}</span></div>
                    <p className="mt-1 text-[12px] text-muted">{t('people.farmer.ledgerLater')}</p>
                  </li>
                );
              })}
            </ul>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        { key: 'trees', label: t('people.tab.trees'), count: mine.trees.length, content: mine.trees.length ? <TreeList trees={mine.trees} /> : <TabEmpty>{t('land.noTreesHere')}</TabEmpty> },
        { key: 'trainings', label: t('people.tab.trainings'), count: mine.trainings.length, content: mine.trainings.length ? <WorkshopList workshops={mine.trainings} farmerId={row.id} /> : <TabEmpty>{t('ws.noTrainings')}</TabEmpty> },
        { key: 'surveys', label: t('people.tab.surveys'), content: <TabEmpty>{t('people.laterPhase')}</TabEmpty> },
        {
          key: 'groups', label: terms.farmerGroups, count: mine.memberships.filter((m) => !m.leftAt).length, content: mine.memberships.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line">
              {mine.memberships.map((m) => {
                const g = groups.find((x) => x.id === m.groupId);
                return <li key={m.id}><button type="button" onClick={() => navigate(`/app/groups?open=${m.groupId}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] hover:bg-canvas"><span className="flex-1 text-ink">{g?.name}</span><span className="text-[12px] text-muted">{t(`people.memberRole.${m.role}`)} · {f.date(m.joinedAt)}{m.leftAt ? ` – ${f.date(m.leftAt)}` : ''}</span></button></li>;
              })}
            </ul>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        {
          key: 'score', label: t('col.score'), content: <ScoreView model={FARMER_MODEL} breakdown={breakdown} prefix="people.score.farmer" stored={row.score} onRecalculate={() => update({ score: breakdown.total }, 'farmer.scored', { score: breakdown.total })} />,
        },
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="farmer" entityId={row.id} /> },
      ]}
    />
  );
}

function FarmerDashboard({ rows }: { rows: FarmerRow[] }) {
  const { t, terms } = useT();
  const f = useFormat();
  const { lang } = useActor();
  const form = useLiveForm('farmerProfile');
  const optionLabel = (qid: string, value: string) => {
    const q = form.sections.flatMap((s) => s.questions).find((x) => x.id === qid);
    const o = q?.options?.find((x) => x.value === value);
    return o ? o.label[lang] ?? o.label.en ?? value : value;
  };
  const tally = (key: (r: FarmerRow) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const women = rows.filter((r) => r.gender === 'F').length;
  const nums = (k: string) => rows.map((r) => Number(r.customFields[k])).filter((n) => Number.isFinite(n) && n > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.registeredAt.slice(0, 7), (m.get(r.registeredAt.slice(0, 7)) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([k, n]) => ({ label: f.date(`${k}-01`, 'MMM yy'), registered: n }));
  }, [rows, f]);
  const card = (label: string, value: string, detail?: string) => (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{label}</div><div className="tnum mt-2 text-[28px] font-semibold text-ink">{value}</div>{detail && <div className="mt-1 text-[13px] text-muted">{detail}</div>}</div>
  );
  const panel = (title: string, body: React.ReactNode) => <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{title}</h3>{body}</div>;
  const top = (list: [string, number][], label: (k: string) => string) => {
    const head = list.slice(0, 6).map(([k, v]) => ({ label: label(k), value: v }));
    const rest = list.slice(6).reduce((s, [, v]) => s + v, 0);
    return rest ? [...head, { label: t('people.dash.other'), value: rest }] : head;
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {card(t('people.dash.total', { farmers: terms.farmers }), f.number(rows.length))}
        {card(t('people.dash.women'), `${f.number(rows.length ? (women / rows.length) * 100 : 0, { maximumFractionDigits: 1 })}%`, t('people.dash.ofTotal', { n: f.number(women), total: f.number(rows.length) }))}
        {card(t('people.dash.avgHousehold'), f.number(avg(nums('householdSize')), { maximumFractionDigits: 1 }), t('people.dash.answered', { n: f.number(nums('householdSize').length) }))}
        {card(t('people.dash.avgChildren'), f.number(avg(rows.map((r) => Number(r.customFields.numberOfChildren)).filter((n) => Number.isFinite(n))), { maximumFractionDigits: 1 }))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {panel(t('people.dash.gender'), <Donut data={(['F', 'M'] as const).map((g, i) => ({ label: t(`gender.${g}`), value: rows.filter((r) => r.gender === g).length, index: i }))} format={(v) => f.number(v)} />)}
        {panel(t('people.dash.ageBands'), <HBars data={AGE_BANDS.map(([lo, hi]) => ({ label: hi >= 120 ? `${lo}+` : `${lo}–${hi}`, value: rows.filter((r) => r.age >= lo && r.age <= hi).length }))} format={(v) => f.number(v)} />)}
        {panel(t('people.dash.education'), <HBars data={top(tally((r) => r.customFields.educationLevel as string | undefined), (k) => optionLabel('educationLevel', k))} format={(v) => f.number(v)} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {panel(t('people.dash.income'), <HBars data={top(tally((r) => r.customFields.incomePrimary as string | undefined), (k) => optionLabel('incomePrimary', k))} format={(v) => f.number(v)} />)}
        {panel(t('people.dash.byAgent', { agent: terms.agent.toLocaleLowerCase() }), <HBars data={top(tally((r) => r.agent), (k) => k)} format={(v) => f.number(v)} />)}
      </div>
      {panel(t('people.dash.registrations'), <StackedColumns data={months} series={[{ key: 'registered', label: t('people.dash.registered'), index: 0 }]} format={(v) => f.number(v)} />)}
    </div>
  );
}
