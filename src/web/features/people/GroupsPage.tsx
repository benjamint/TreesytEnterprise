import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { FarmerGroup, GroupMembership, RecordDocument, SavingsEntry } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { usePageTour } from '@/components/shared/PageTour';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { AnswersView, FormFields } from '@/components/forms/FormFields';
import { groupProfileForm } from '@/data/forms/profiles';
import { validateAnswers } from '@/engines/forms';
import { toMinor } from '@/engines/money';
import { GROUP_MODEL, groupScore, type ManualScores } from '@/services/scoreService';
import { formatPhone } from '@/lib/format';
import { uid } from '@/lib/utils';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { useBuyingStore } from '@/stores/buyingStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useRecordsStore } from '@/stores/recordsStore';
import { useActor, useCan, useCurrentOrg, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ScoreChip } from './CommunitiesPage';
import { Field } from './CommunityForm';
import { ActivityFeed, DocumentsPanel, LeadersPanel, ScoreView, logActivity, useLookups } from './shared';

const TYPES: FarmerGroup['type'][] = ['COOPERATIVE', 'VSLA', 'WOMENS_GROUP', 'PRODUCER_GROUP'];
const ROLES: GroupMembership['role'][] = ['MEMBER', 'LEADER', 'SECRETARY', 'TREASURER'];
const DOC_TYPES = ['meetingRecords', 'contributionRecords', 'membershipList', 'other'];
/** Uploading one of these resets the matching manual score and asks for a review (PRD C4). */
const REVIEWED_DOCS: Record<string, keyof ManualScores> = { meetingRecords: 'meetingMinutes', contributionRecords: 'contributionRecords' };
const LEADER_POSITIONS = { en: ['President', 'Secretary', 'Treasurer', 'Organiser'], fr: ['Président(e)', 'Secrétaire', 'Trésorier(ère)', 'Animateur(trice)'] };
const sel = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';

function useGroupRows() {
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const memberships = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const leaders = useOrgRows(useRecordsStore((s) => s.leaders));
  const lk = useLookups();
  return useMemo(() => {
    const gender = new Map(farmers.map((f) => [f.id, f.gender]));
    const active = new Map<string, GroupMembership[]>();
    for (const m of memberships) if (!m.leftAt) active.set(m.groupId, [...(active.get(m.groupId) ?? []), m]);
    return groups.map((g) => {
      const ms = active.get(g.id) ?? [];
      const women = ms.filter((m) => gender.get(m.farmerId) === 'F').length;
      return {
        ...g, community: lk.community(g.communityId), members: ms.length, womenPct: ms.length ? Math.round((women / ms.length) * 100) : 0,
        leaders: ms.filter((m) => m.role !== 'MEMBER').length + leaders.filter((l) => l.entity === 'farmerGroup' && l.entityId === g.id).length,
      };
    });
  }, [groups, memberships, farmers, leaders, lk]);
}
type Row = ReturnType<typeof useGroupRows>[number];

/** Farmer groups (PRD C4): list, create/edit, drawer with members, documents, scorecard and savings. */
export function GroupsPage() {
  const org = useCurrentOrg();
  const { t, terms } = useT();
  const f = useFormat();
  const rows = useGroupRows();
  const lk = useLookups();
  const [openId, openDrawer, closeDrawer] = useDrawerParam();
  const [form, setForm] = useState<{ group?: FarmerGroup } | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [community, setCommunity] = useState('');
  const [view, setView] = useState<'all' | 'pending' | 'savings'>('all');
  const tour = usePageTour();
  const startTour = tour.start;
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, startTour);
    return () => window.removeEventListener(TOUR_EVENT, startTour);
  }, [startTour]);
  useDemoNotes([{ id: 'groups', key: 'demo.note.groups' }]);

  const query = q.trim().toLowerCase();
  const inView = (r: Row, v: typeof view) => v === 'all' || (v === 'pending' && r.scoreStatus === 'PENDING_REVIEW') || (v === 'savings' && r.type === 'VSLA');
  const shown = rows.filter((r) => (!query || r.name.toLowerCase().includes(query) || r.community.toLowerCase().includes(query)) && (!type || r.type === type) && (!community || r.communityId === community) && inView(r, view));

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'type', header: t('col.type'), accessorKey: 'type', cell: (c) => t(`groupType.${c.getValue() as string}`) },
    { id: 'community', header: terms.community, accessorKey: 'community' },
    { id: 'members', header: t('col.members'), accessorKey: 'members' },
    { id: 'women', header: t('people.group.womenPct'), accessorKey: 'womenPct', cell: (c) => `${c.getValue() as number}%` },
    { id: 'leaders', header: t('people.tab.leaders'), accessorKey: 'leaders' },
    { id: 'established', header: t('people.group.established'), accessorKey: 'established', cell: (c) => f.date(c.getValue() as string) },
    { id: 'payment', header: t('people.group.paymentOption'), accessorKey: 'paymentOption', cell: (c) => t(`people.group.pay.${c.getValue() as string}`) },
    { id: 'score', header: t('col.score'), accessorKey: 'score', cell: (c) => <ScoreChip score={c.getValue() as number} /> },
    { id: 'scoreStatus', header: t('people.group.scoreStatus'), accessorKey: 'scoreStatus', cell: (c) => <Badge tone={c.getValue() === 'PENDING_REVIEW' ? 'warning' : 'success'}>{t(`people.group.status.${c.getValue() as string}`)}</Badge> },
  ], [t, f, terms]);

  const current = rows.find((r) => r.id === openId);
  return (
    <>
      {tour.element}
      <PageHeader
        eyebrow={t('nav.section.people')}
        title={terms.farmerGroups}
        description={t('pages.groups')}
        onTour={startTour}
        primary={<PermissionGate permission="groups.create"><Button onClick={() => setForm({})}><Plus /> {t('people.group.new')}</Button></PermissionGate>}
      />
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('people.searchGroups')}
        views={(['all', 'pending', 'savings'] as const).map((v) => ({ key: v, label: t(`people.groupView.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v)).length }))}
        filters={[
          { key: 'type', label: t('col.type'), value: type, onChange: setType, options: TYPES.map((x) => ({ value: x, label: t(`groupType.${x}`) })) },
          { key: 'community', label: terms.community, value: community, onChange: setCommunity, options: lk.communities.filter((c) => rows.some((r) => r.communityId === c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })) },
        ]}
        onClear={() => { setQ(''); setType(''); setCommunity(''); setView('all'); }}
      />
      <DataTable
        columns={columns}
        data={shown}
        onRowClick={(r) => openDrawer(r.id)}
        getRowId={(r) => r.id}
        activeId={openId}
        columnPicker
        exportCsv={{ fileName: `${org.code.toLowerCase()}-groups.csv`, columns: [
          { header: t('col.name'), value: (r) => r.name }, { header: t('col.type'), value: (r) => r.type }, { header: terms.community, value: (r) => r.community },
          { header: t('col.members'), value: (r) => r.members }, { header: t('people.group.womenPct'), value: (r) => r.womenPct }, { header: t('col.score'), value: (r) => r.score }, { header: t('people.group.scoreStatus'), value: (r) => r.scoreStatus },
        ] }}
        empty={t('people.noMatch')}
      />
      {current && <GroupDrawer key={current.id} row={current} onClose={closeDrawer} onEdit={() => setForm({ group: current })} />}
      {form && <GroupForm group={form.group} onClose={(id) => { setForm(null); if (id) openDrawer(id); }} />}
    </>
  );
}

function GroupForm({ group, onClose }: { group?: FarmerGroup; onClose: (id?: string) => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const lk = useLookups();
  const form = useMemo(() => groupProfileForm(orgId), [orgId]);
  const [g, setG] = useState<FarmerGroup>(group ?? {
    id: uid('grp'), orgId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: userId ?? 'system', name: '', type: 'COOPERATIVE',
    communityId: [...lk.communities].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? '', established: new Date().toISOString().slice(0, 10), paymentOption: 'MOMO', score: 0, scoreStatus: 'PENDING_REVIEW', customFields: {},
  });
  const [tried, setTried] = useState(false);
  const errors = validateAnswers(form, g.customFields);
  const save = () => {
    setTried(true);
    if (!g.name.trim() || errors.length) return;
    // One group per name in a community: an existing one is updated, never duplicated.
    const existing = useGroupStore.getState().groups.find((x) => x.orgId === orgId && x.id !== g.id && x.communityId === g.communityId && x.name.trim().toLowerCase() === g.name.trim().toLowerCase());
    const next = { ...(existing ?? {}), ...g, id: existing?.id ?? g.id, name: g.name.trim(), updatedAt: new Date().toISOString() };
    useGroupStore.getState().saveGroup(next);
    logActivity(orgId, 'farmerGroup', next.id, group || existing ? 'group.updated' : 'group.created', { name: next.name }, userId ?? 'system');
    toast.success(t(group || existing ? 'people.group.saved' : 'people.group.created', { name: next.name }));
    onClose(next.id);
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{group ? group.name : t('people.group.new')}</SheetTitle></div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('people.name')} error={tried && !g.name.trim() ? t('form.error.required') : undefined}><Input compact value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} aria-label={t('people.name')} /></Field>
            <Field label={t('col.type')}><select className={sel} value={g.type} onChange={(e) => setG({ ...g, type: e.target.value as FarmerGroup['type'] })} aria-label={t('col.type')}>{TYPES.map((x) => <option key={x} value={x}>{t(`groupType.${x}`)}</option>)}</select></Field>
            <Field label={terms.community}><select className={sel} value={g.communityId} onChange={(e) => setG({ ...g, communityId: e.target.value })} aria-label={terms.community}>{[...lk.communities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('people.group.established')}><Input compact type="date" value={g.established} onChange={(e) => setG({ ...g, established: e.target.value })} aria-label={t('people.group.established')} /></Field>
          </div>
          <div>
            <h3 className="mb-3 text-[15px] font-semibold text-ink">{t('people.profile')} <span className="text-[12px] font-normal text-muted">{form.name} · {t('set.forms.v', { n: form.version })}</span></h3>
            <FormFields form={form} answers={g.customFields} onChange={(customFields) => setG({ ...g, customFields })} errors={tried ? errors : []} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GroupDrawer({ row, onClose, onEdit }: { row: Row; onClose: () => void; onEdit: () => void }) {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lang = useLang();
  const lk = useLookups();
  const navigate = useNavigate();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const memberships = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const purchases = useOrgRows(useBuyingStore((s) => s.purchases));
  const form = useMemo(() => groupProfileForm(orgId), [orgId]);
  const [adding, setAdding] = useState(false);
  const canEdit = useCan()('groups.edit');
  const mine = useMemo(() => memberships.filter((m) => m.groupId === row.id).sort((a, b) => (a.leftAt ? 1 : 0) - (b.leftAt ? 1 : 0) || ROLES.indexOf(b.role) - ROLES.indexOf(a.role)), [memberships, row.id]);
  const farmerById = useMemo(() => new Map(farmers.map((x) => [x.id, x])), [farmers]);
  const memberIds = useMemo(() => new Set(mine.filter((m) => !m.leftAt).map((m) => m.farmerId)), [mine]);
  const memberPurchases = useMemo(() => purchases.filter((p) => memberIds.has(p.farmerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [purchases, memberIds]);
  const breakdown = useMemo(() => groupScore(row, { memberships, farmers, purchases }), [row, memberships, farmers, purchases]);
  const manual = (row.customFields.manualScores ?? {}) as ManualScores;
  const save = (patch: Partial<FarmerGroup>) => {
    const cur = useGroupStore.getState().groups.find((x) => x.id === row.id)!;
    useGroupStore.getState().saveGroup({ ...cur, ...patch, updatedAt: new Date().toISOString() });
  };
  const onDoc = (d: RecordDocument) => {
    const key = REVIEWED_DOCS[d.type];
    if (!key) return;
    const cur = useGroupStore.getState().groups.find((x) => x.id === row.id)!;
    const ms = { ...((cur.customFields.manualScores ?? {}) as ManualScores), [key]: null };
    const next = { ...cur, scoreStatus: 'PENDING_REVIEW' as const, customFields: { ...cur.customFields, manualScores: ms } };
    useGroupStore.getState().saveGroup({ ...next, score: groupScore(next, { memberships, farmers, purchases }).total });
    logActivity(orgId, 'farmerGroup', row.id, 'group.reviewNeeded', { doc: t(`people.docType.${d.type}`) }, userId ?? 'system');
    toast(t('people.group.reviewNeeded'));
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={row.name}
      subtitle={`${t(`groupType.${row.type}`)} · ${row.community}`}
      badges={<><ScoreChip score={row.score} /><Badge tone={row.scoreStatus === 'PENDING_REVIEW' ? 'warning' : 'success'}>{t(`people.group.status.${row.scoreStatus}`)}</Badge></>}
      actions={<PermissionGate permission="groups.edit"><Button size="sm" variant="secondary" onClick={onEdit}><Pencil /> {t('people.edit')}</Button></PermissionGate>}
      tabs={[
        {
          key: 'profile', label: t('people.tab.profile'), content: (
            <div className="space-y-6">
              <Facts items={[[t('col.type'), t(`groupType.${row.type}`)], [terms.community, row.community], [t('people.group.established'), f.date(row.established)], [t('col.members'), f.number(row.members)], [t('people.group.womenPct'), `${row.womenPct}%`], [t('people.group.paymentOption'), t(`people.group.pay.${row.paymentOption}`)]]} />
              <div><p className="mb-3 text-[12px] text-muted">{form.name} · {t('set.forms.v', { n: form.version })}</p><AnswersView form={form} answers={row.customFields} /></div>
            </div>
          ),
        },
        {
          key: 'members', label: t('col.members'), count: row.members, content: (
            <div className="space-y-3">
              <PermissionGate permission="groups.edit"><Button size="sm" variant="secondary" onClick={() => setAdding(true)}><UserPlus /> {t('people.group.addMember')}</Button></PermissionGate>
              {mine.length ? (
                <ul className="divide-y divide-line rounded-ctl border border-line">
                  {mine.map((m) => {
                    const x = farmerById.get(m.farmerId);
                    return (
                      <li key={m.id} className={`flex items-center gap-3 px-4 py-2.5 ${m.leftAt ? 'opacity-60' : ''}`}>
                        <button type="button" onClick={() => navigate(`/app/farmers?open=${m.farmerId}`)} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-[14px] font-medium text-ink">{x ? `${x.firstName} ${x.lastName}` : m.farmerId}</div>
                          <div className="text-[12px] text-muted">{x?.farmerCode} · {t('people.group.joined', { date: f.date(m.joinedAt) })}{m.leftAt ? ` · ${t('people.group.left', { date: f.date(m.leftAt) })}` : ''}</div>
                        </button>
                        {!m.leftAt && (
                          canEdit ? (<>
                            <select value={m.role} onChange={(e) => useGroupStore.getState().setMemberRole(m.id, e.target.value as GroupMembership['role'])} aria-label={t('people.role')} className="h-9 rounded-ctl border border-line bg-surface px-2 text-[13px] text-ink">
                              {ROLES.map((r) => <option key={r} value={r}>{t(`people.memberRole.${r}`)}</option>)}
                            </select>
                            <Button variant="ghost" size="iconSm" aria-label={t('people.group.removeMember')} onClick={() => { useGroupStore.getState().endMembership(m.id); logActivity(orgId, 'farmerGroup', row.id, 'group.memberLeft', { name: x ? `${x.firstName} ${x.lastName}` : '' }, userId ?? 'system'); }}><Trash2 /></Button>
                          </>) : <span className="text-[12px] text-muted">{t(`people.memberRole.${m.role}`)}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <TabEmpty>{t('people.none')}</TabEmpty>}
              {adding && <AddMemberDialog group={row} memberIds={memberIds} onClose={() => setAdding(false)} />}
            </div>
          ),
        },
        { key: 'leaders', label: t('people.tab.leaders'), content: <LeadersPanel entity="farmerGroup" entityId={row.id} roles={LEADER_POSITIONS[lang]} permission="groups.edit" /> },
        { key: 'documents', label: t('people.tab.documents'), content: <DocumentsPanel entity="farmerGroup" entityId={row.id} types={DOC_TYPES} permission="groups.edit" onUploaded={onDoc} /> },
        { key: 'payment', label: t('people.tab.payment'), content: <PaymentDetails group={row} onSave={(patch) => { save(patch); logActivity(orgId, 'farmerGroup', row.id, 'group.paymentUpdated', {}, userId ?? 'system'); toast.success(t('people.group.paymentSaved')); }} /> },
        { key: 'support', label: t('nav.support'), content: <TabEmpty>{t('people.laterPhase')}</TabEmpty> },
        {
          key: 'purchases', label: t('nav.purchases'), count: memberPurchases.length, content: memberPurchases.length ? (
            <div className="space-y-3">
              <p className="text-[13px] text-muted">{t('people.group.memberPurchases', { kg: f.kg(Math.round(memberPurchases.reduce((s, p) => s + p.quantity, 0))) })}</p>
              <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
                {memberPurchases.slice(0, 25).map((p) => { const x = farmerById.get(p.farmerId); return <li key={p.id} className="flex items-center gap-3 px-4 py-2"><span className="font-mono text-muted">{p.number}</span><span className="flex-1 truncate">{x?.firstName} {x?.lastName} · {lk.commodity(p.commodityId)} · {f.kg(p.quantity)}</span><span className="tnum text-ink">{f.money(p.amount)}</span></li>; })}
              </ul>
            </div>
          ) : <TabEmpty>{t('people.none')}</TabEmpty>,
        },
        {
          key: 'score', label: t('col.score'), content: (
            <div className="space-y-6">
              <ScoreView model={GROUP_MODEL} breakdown={breakdown} prefix="people.score.group" stored={row.score} onRecalculate={() => { save({ score: breakdown.total }); logActivity(orgId, 'farmerGroup', row.id, 'group.scored', { score: breakdown.total }, userId ?? 'system'); }} />
              <ManualReview group={row} manual={manual} onSave={(ms) => {
                const cur = useGroupStore.getState().groups.find((x) => x.id === row.id)!;
                const next = { ...cur, scoreStatus: 'COMPLETED' as const, customFields: { ...cur.customFields, manualScores: { ...ms, reviewedBy: userId ?? 'system', reviewedAt: new Date().toISOString() } } };
                // Recalculation replaces the old score; it never adds to it.
                const total = groupScore(next, { memberships, farmers, purchases }).total;
                useGroupStore.getState().saveGroup({ ...next, score: total, updatedAt: new Date().toISOString() });
                logActivity(orgId, 'farmerGroup', row.id, 'group.reviewed', { score: total, note: ms.note || '—' }, userId ?? 'system');
                toast.success(t('people.group.reviewed', { score: f.number(total) }));
              }} />
            </div>
          ),
        },
        ...(row.type === 'VSLA' ? [{ key: 'savings', label: t('people.tab.savings'), content: <SavingsLedger group={row} /> }] : []),
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="farmerGroup" entityId={row.id} /> },
      ]}
    />
  );
}

function AddMemberDialog({ group, memberIds, onClose }: { group: Row; memberIds: Set<string>; onClose: () => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const pool = farmers.filter((x) => x.communityId === group.communityId && !memberIds.has(x.id) && (!q || `${x.firstName} ${x.lastName} ${x.farmerCode}`.toLowerCase().includes(q.toLowerCase())));
  const add = () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const id of picked) useGroupStore.getState().addMembership({ id: uid('gm'), orgId, groupId: group.id, farmerId: id, role: 'MEMBER', joinedAt: today });
    logActivity(orgId, 'farmerGroup', group.id, 'group.membersAdded', { count: picked.length }, userId ?? 'system');
    toast.success(t('people.group.membersAdded', { count: picked.length }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('people.group.addMember')}</DialogTitle></DialogHeader>
        <Input compact value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('people.searchFarmers')} aria-label={t('people.searchFarmers')} autoFocus />
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
          {pool.slice(0, 60).map((x) => (
            <li key={x.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-canvas">
                <input type="checkbox" checked={picked.includes(x.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((p) => p !== x.id))} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                <span className="flex-1 text-ink">{x.firstName} {x.lastName}</span>
                <span className="font-mono text-[12px] text-muted">{x.farmerCode}</span>
              </label>
            </li>
          ))}
          {!pool.length && <li className="px-4 py-6 text-center text-[14px] text-muted">{t('people.none')}</li>}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={add} disabled={!picked.length}>{t('people.group.addCount', { count: picked.length })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDetails({ group, onSave }: { group: FarmerGroup; onSave: (patch: Partial<FarmerGroup>) => void }) {
  const { t } = useT();
  const settings = useOrgSettings();
  const bank = (group.customFields.bank ?? { name: '', account: '' }) as { name: string; account: string };
  const [option, setOption] = useState(group.paymentOption);
  const [wallet, setWallet] = useState(group.wallet ?? { provider: settings.paymentProviders[0]?.id ?? '', number: '', name: '' });
  const [b, setB] = useState(bank);
  const [acceptsSim, setAcceptsSim] = useState(Boolean(group.customFields.acceptsMomoSim));
  return (
    <div className="space-y-4">
      <Field label={t('people.group.paymentOption')}>
        <select className={sel} value={option} onChange={(e) => setOption(e.target.value as FarmerGroup['paymentOption'])} aria-label={t('people.group.paymentOption')}>
          {(['MOMO', 'BANK', 'CASH'] as const).map((o) => <option key={o} value={o}>{t(`people.group.pay.${o}`)}</option>)}
        </select>
      </Field>
      {option === 'MOMO' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('col.provider')}><select className={sel} value={wallet.provider} onChange={(e) => setWallet({ ...wallet, provider: e.target.value })} aria-label={t('col.provider')}>{settings.paymentProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label={t('people.phone')}><Input compact type="tel" value={wallet.number} onChange={(e) => setWallet({ ...wallet, number: e.target.value })} aria-label={t('people.phone')} /></Field>
          <Field label={t('people.group.walletName')}><Input compact value={wallet.name} onChange={(e) => setWallet({ ...wallet, name: e.target.value })} aria-label={t('people.group.walletName')} /></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-[14px] text-ink"><input type="checkbox" checked={acceptsSim} onChange={(e) => setAcceptsSim(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />{t('people.group.acceptsSim')}</label>
        </div>
      )}
      {option === 'BANK' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('people.group.bankName')}><Input compact value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} aria-label={t('people.group.bankName')} /></Field>
          <Field label={t('people.group.bankAccount')}><Input compact value={b.account} onChange={(e) => setB({ ...b, account: e.target.value })} aria-label={t('people.group.bankAccount')} /></Field>
        </div>
      )}
      {option === 'MOMO' && group.wallet && <p className="text-[13px] text-muted">{t('people.group.currentWallet', { number: formatPhone(group.wallet.number), name: group.wallet.name })}</p>}
      <PermissionGate permission="groups.edit">
        <Button onClick={() => onSave({ paymentOption: option, wallet: option === 'MOMO' ? wallet : group.wallet, customFields: { ...group.customFields, bank: b, acceptsMomoSim: acceptsSim } })}>{t('common.save')}</Button>
      </PermissionGate>
    </div>
  );
}

function ManualReview({ group, manual, onSave }: { group: FarmerGroup; manual: ManualScores; onSave: (m: ManualScores) => void }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const [mm, setMm] = useState<number | ''>(manual.meetingMinutes ?? '');
  const [cr, setCr] = useState<number | ''>(manual.contributionRecords ?? '');
  const [note, setNote] = useState('');
  const canEdit = useCan()('groups.reviewScore');
  const valid = mm !== '' && cr !== '' && mm >= 1 && mm <= 4 && cr >= 1 && cr <= 18;
  return (
    <div className={`rounded-ctl border p-4 ${group.scoreStatus === 'PENDING_REVIEW' ? 'border-warning/40 bg-warning/5' : 'border-line'}`}>
      <h3 className="text-[15px] font-semibold text-ink">{t('people.group.manualReview')}</h3>
      <p className="mt-1 text-[13px] text-muted">{group.scoreStatus === 'PENDING_REVIEW' ? t('people.group.reviewPending') : t('people.group.reviewDone', { by: lk.user(manual.reviewedBy ?? 'system'), date: manual.reviewedAt ? f.date(manual.reviewedAt) : '—' })}</p>
      {canEdit && (<>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('people.group.meetingMinutesRange')}><Input compact type="number" min={1} max={4} value={mm} onChange={(e) => setMm(e.target.value === '' ? '' : Number(e.target.value))} aria-label={t('people.group.meetingMinutesRange')} /></Field>
          <Field label={t('people.group.contributionRange')}><Input compact type="number" min={1} max={18} value={cr} onChange={(e) => setCr(e.target.value === '' ? '' : Number(e.target.value))} aria-label={t('people.group.contributionRange')} /></Field>
        </div>
        <div className="mt-3"><Field label={t('people.group.reviewNote')}><Input compact value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('people.group.reviewNote')} /></Field></div>
        <Button className="mt-3" disabled={!valid} onClick={() => onSave({ meetingMinutes: Number(mm), contributionRecords: Number(cr), note })}>{t('people.group.saveReview')}</Button>
      </>)}
    </div>
  );
}

function SavingsLedger({ group }: { group: FarmerGroup }) {
  const { orgId } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const all = useGroupStore((s) => s.savings);
  const memberships = useOrgRows(useGroupStore((s) => s.groupMemberships));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const entries = useMemo(() => all.filter((e) => e.groupId === group.id).sort((a, b) => b.date.localeCompare(a.date)), [all, group.id]);
  const members = useMemo(() => memberships.filter((m) => m.groupId === group.id && !m.leftAt).map((m) => farmers.find((x) => x.id === m.farmerId)).filter((x): x is NonNullable<typeof x> => !!x), [memberships, farmers, group.id]);
  const canEdit = useCan()('groups.manageSavings');
  const [entry, setEntry] = useState<{ kind: SavingsEntry['kind']; farmerId: string; amount: string } | null>(null);
  const sum = (k: SavingsEntry['kind']) => entries.filter((e) => e.kind === k).reduce((s, e) => s + e.amount.amountMinor, 0);
  const fund = sum('CONTRIBUTION') - sum('LOAN') + sum('REPAYMENT') - sum('SHAREOUT');
  const money = (minor: number) => f.money({ amountMinor: minor, currency: org.currency });
  const cycle = entries[0]?.cycle ?? 1;
  const save = () => {
    if (!entry || !Number(entry.amount)) return;
    useGroupStore.getState().addSavings({ id: uid('sv'), orgId, groupId: group.id, cycle, date: new Date().toISOString().slice(0, 10), kind: entry.kind, farmerId: entry.farmerId || undefined, amount: { amountMinor: toMinor(Number(entry.amount), org.currency), currency: org.currency } });
    setEntry(null);
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[[t('people.savings.fund'), money(fund)], [t('people.savings.saved'), money(sum('CONTRIBUTION'))], [t('people.savings.lent'), money(sum('LOAN') - sum('REPAYMENT'))]].map(([k, v]) => (
          <div key={k} className="rounded-ctl border border-line p-4"><div className="eyebrow">{k}</div><div className="tnum mt-1 text-[20px] font-semibold text-ink">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">{t('people.savings.cycle', { n: cycle })}</span>
        {canEdit && (['CONTRIBUTION', 'LOAN', 'REPAYMENT', 'SHAREOUT'] as const).map((k) => <Button key={k} size="sm" variant="secondary" onClick={() => setEntry({ kind: k, farmerId: members[0]?.id ?? '', amount: '' })}>{t(`people.savings.kind.${k}`)}</Button>)}
      </div>
      {entries.length ? (
        <ul className="divide-y divide-line rounded-ctl border border-line text-[13px]">
          {entries.slice(0, 40).map((e) => { const x = farmers.find((y) => y.id === e.farmerId); return <li key={e.id} className="flex items-center gap-3 px-4 py-2"><span className="w-24 text-muted">{f.date(e.date)}</span><Badge tone={e.kind === 'LOAN' ? 'warning' : e.kind === 'SHAREOUT' ? 'info' : 'success'}>{t(`people.savings.kind.${e.kind}`)}</Badge><span className="flex-1 truncate text-ink">{x ? `${x.firstName} ${x.lastName}` : '—'}</span><span className="tnum text-ink">{f.money(e.amount)}</span></li>; })}
        </ul>
      ) : <TabEmpty>{t('people.none')}</TabEmpty>}
      <Dialog open={!!entry} onOpenChange={(o) => !o && setEntry(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{entry ? t(`people.savings.kind.${entry.kind}`) : ''}</DialogTitle></DialogHeader>
          {entry && (
            <div className="space-y-3">
              {entry.kind !== 'SHAREOUT' && <select className={sel} value={entry.farmerId} onChange={(e) => setEntry({ ...entry, farmerId: e.target.value })} aria-label={t('col.members')}>{members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</select>}
              <Input compact type="number" min={0} value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} placeholder={t('col.amount')} aria-label={t('col.amount')} autoFocus />
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEntry(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={!entry || !Number(entry.amount)}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
