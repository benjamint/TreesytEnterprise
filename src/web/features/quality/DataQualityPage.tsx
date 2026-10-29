import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheck, RefreshCcw, Send, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { QualityEntity, QualityIssue } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { HBars, StackedColumns } from '@/components/charts/charts';
import { assignToAgents, markValid, recheck } from '@/services/qualityService';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { ruleLabel } from '@/web/features/people/quality';

type View = 'active' | 'OPEN' | 'ASSIGNED' | 'VALID' | 'RESOLVED' | 'all';
const SEV_TONE = { info: 'info', warning: 'warning', block: 'danger' } as const;
const STATUS_TONE = { OPEN: 'warning', ASSIGNED: 'info', VALID: 'neutral', RESOLVED: 'success' } as const;
const SOURCES = ['SEED', 'IMPORT', 'WEB', 'MOBILE', 'RECHECK'] as const;
const LINK: Record<QualityEntity, string> = { farmer: '/app/farmers', community: '/app/communities', farmerGroup: '/app/groups' };

/** Data quality review (PRD C5): flagged-record queue, bulk assign / mark valid / re-check, rule charts. */
export function DataQualityPage() {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const settings = useOrgSettings();
  const lk = useLookups();
  const issues = useOrgRows(useQualityStore((s) => s.issues));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const [view, setView] = useState<View>('active');
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [rule, setRule] = useState('');
  const [severity, setSeverity] = useState('');
  const [agent, setAgent] = useState('');
  const [source, setSource] = useState(params.get('source') ?? '');
  const [dialog, setDialog] = useState<{ kind: 'assign' | 'valid'; ids: string[]; clear: () => void } | null>(null);
  const record = params.get('record');
  useDemoNotes([{ id: 'dq', key: 'demo.note.dataQuality' }]);

  const rows = useMemo(() => {
    const names = new Map<string, { name: string; code: string }>();
    for (const x of farmers) names.set(x.id, { name: `${x.firstName} ${x.lastName}`, code: x.farmerCode });
    for (const x of communities) names.set(x.id, { name: x.name, code: x.code });
    for (const x of groups) names.set(x.id, { name: x.name, code: lk.community(x.communityId) });
    return issues.map((i) => ({ ...i, record: names.get(i.recordId) ?? { name: i.recordId, code: '' }, rule: settings.qualityRules.find((r) => r.id === i.ruleId) }));
  }, [issues, farmers, communities, groups, settings.qualityRules, lk]);
  type Row = (typeof rows)[number];

  const inView = (r: Row, v: View) => v === 'all' || (v === 'active' ? r.status === 'OPEN' || r.status === 'ASSIGNED' : r.status === v);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => inView(r, view) && (!record || r.recordId === record) && (!query || r.record.name.toLowerCase().includes(query) || r.record.code.toLowerCase().includes(query)) &&
    (!entity || r.entity === entity) && (!rule || r.ruleId === rule) && (!severity || r.severity === severity) && (!agent || r.agentId === agent) && (!source || r.source === source))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = rows.filter((r) => inView(r, 'active'));

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'record', header: t('dq.record'), accessorFn: (r) => r.record.name, cell: (c) => <div className="min-w-0"><div className="truncate font-medium text-ink">{c.row.original.record.name}</div><div className="text-[12px] text-muted">{t(`set.dq.entityName.${c.row.original.entity}`)} · <span className="font-mono">{c.row.original.record.code}</span></div></div> },
    { id: 'rule', header: t('dq.rule'), accessorFn: (r) => ruleLabel(r.rule, t) },
    { id: 'value', header: t('dq.value'), accessorFn: (r) => (r.params.value == null || r.params.value === '' ? '—' : typeof r.params.value === 'object' ? '…' : String(r.params.value)), cell: (c) => <span className="font-mono text-[13px]">{c.getValue() as string}</span> },
    { id: 'severity', header: t('set.dq.severity'), accessorKey: 'severity', cell: (c) => <Badge tone={SEV_TONE[c.getValue() as QualityIssue['severity']]}>{t(`set.dq.sev.${c.getValue() as string}`)}</Badge> },
    { id: 'agent', header: terms.agent, accessorFn: (r) => lk.agent(r.agentId) },
    { id: 'source', header: t('dq.source'), accessorKey: 'source', cell: (c) => t(`dq.sourceName.${c.getValue() as string}`) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={STATUS_TONE[c.getValue() as QualityIssue['status']]}>{t(`dq.status.${c.getValue() as string}`)}</Badge> },
    { id: 'date', header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
  ], [t, f, lk, terms]);

  const recheckAll = () => {
    const raised = (['farmer', 'community', 'farmerGroup'] as const).flatMap((e) => recheck(orgId, e, null, 'RECHECK', userId ?? 'system'));
    toast.success(t('dq.recheckedAll', { count: raised.length }));
  };
  const recheckSome = (sel: Row[], clear: () => void) => {
    const before = useQualityStore.getState().issues.filter((i) => sel.some((s) => s.id === i.id) && i.status !== 'RESOLVED').length;
    for (const e of ['farmer', 'community', 'farmerGroup'] as const) {
      const ids = [...new Set(sel.filter((s) => s.entity === e).map((s) => s.recordId))];
      if (ids.length) recheck(orgId, e, ids, 'RECHECK', userId ?? 'system');
    }
    const after = useQualityStore.getState().issues.filter((i) => sel.some((s) => s.id === i.id) && i.status !== 'RESOLVED').length;
    toast.success(t('dq.rechecked', { resolved: before - after, still: after }));
    clear();
  };

  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.people')}
        title={t('nav.dataQuality')}
        description={t('pages.dataQuality')}
        actions={<PermissionGate permission="settings.view"><Button variant="secondary" onClick={() => navigate('/app/settings/dataQuality')}><Settings2 /> {t('dq.rules')}</Button></PermissionGate>}
        primary={<PermissionGate permission="dataQuality.resolve"><Button onClick={recheckAll}><RefreshCcw /> {t('dq.recheckAll')}</Button></PermissionGate>}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        {(['OPEN', 'ASSIGNED', 'VALID', 'RESOLVED'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setView(s)} className={`rounded-card border bg-surface p-5 text-left shadow-soft transition-colors ${view === s ? 'border-brand' : 'border-line hover:border-brand/40'}`}>
            <div className="eyebrow">{t(`dq.status.${s}`)}</div>
            <div className="tnum mt-2 text-[24px] font-semibold text-ink">{f.number(rows.filter((r) => r.status === s).length)}</div>
          </button>
        ))}
      </div>
      <Tabs defaultValue="queue">
        <TabsList className="mb-5">
          <TabsTrigger value="queue">{t('dq.queue')}</TabsTrigger>
          <TabsTrigger value="charts">{t('dq.summary')}</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          {record && (
            <div className="mb-3 flex items-center gap-3 rounded-ctl border border-info/30 bg-info/5 px-4 py-2 text-[14px] text-ink">
              {t('dq.filteredRecord', { name: rows.find((r) => r.recordId === record)?.record.name ?? record })}
              <Button size="xs" variant="ghost" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.delete('record'); return n; })}>{t('table.clearFilters')}</Button>
            </div>
          )}
          <FilterBar
            search={q}
            onSearch={setQ}
            placeholder={t('dq.search')}
            views={(['active', 'OPEN', 'ASSIGNED', 'VALID', 'RESOLVED', 'all'] as const).map((v) => ({ key: v, label: v === 'active' || v === 'all' ? t(`dq.view.${v}`) : t(`dq.status.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v)).length }))}
            filters={[
              { key: 'entity', label: t('dq.record'), value: entity, onChange: setEntity, options: (['farmer', 'community', 'farmerGroup'] as const).map((e) => ({ value: e, label: t(`set.dq.entityName.${e}`) })) },
              { key: 'rule', label: t('dq.rule'), value: rule, onChange: setRule, options: settings.qualityRules.filter((r) => rows.some((x) => x.ruleId === r.id)).map((r) => ({ value: r.id, label: ruleLabel(r, t) })) },
              { key: 'severity', label: t('set.dq.severity'), value: severity, onChange: setSeverity, options: (['info', 'warning', 'block'] as const).map((s) => ({ value: s, label: t(`set.dq.sev.${s}`) })) },
              { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((r) => r.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })) },
              { key: 'source', label: t('dq.source'), value: source, onChange: setSource, options: SOURCES.map((s) => ({ value: s, label: t(`dq.sourceName.${s}`) })) },
            ]}
            onClear={() => { setQ(''); setEntity(''); setRule(''); setSeverity(''); setAgent(''); setSource(''); setView('active'); }}
          />
          <DataTable
            columns={columns}
            data={shown}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`${LINK[r.entity]}?open=${r.recordId}`)}
            columnPicker
            initialHidden={['source']}
            bulkActions={(sel, clear) => {
              const openIds = sel.filter((r) => r.status === 'OPEN' || r.status === 'ASSIGNED').map((r) => r.id);
              return (
                <>
                  <PermissionGate permission="dataQuality.assign"><Button size="sm" disabled={!openIds.length} onClick={() => setDialog({ kind: 'assign', ids: openIds, clear })}><Send /> {t('dq.assign')}</Button></PermissionGate>
                  <PermissionGate permission="dataQuality.resolve"><Button size="sm" variant="secondary" disabled={!openIds.length} onClick={() => setDialog({ kind: 'valid', ids: openIds, clear })}><CheckCheck /> {t('dq.markValid')}</Button></PermissionGate>
                  <PermissionGate permission="dataQuality.resolve"><Button size="sm" variant="secondary" onClick={() => recheckSome(sel, clear)}><RefreshCcw /> {t('dq.recheck')}</Button></PermissionGate>
                </>
              );
            }}
            exportCsv={{ fileName: 'data-quality.csv', columns: [
              { header: t('dq.record'), value: (r) => r.record.name }, { header: t('col.code'), value: (r) => r.record.code }, { header: t('dq.rule'), value: (r) => ruleLabel(r.rule, t) },
              { header: t('set.dq.severity'), value: (r) => r.severity }, { header: terms.agent, value: (r) => lk.agent(r.agentId) }, { header: t('col.status'), value: (r) => r.status }, { header: t('col.date'), value: (r) => r.createdAt.slice(0, 10) },
            ] }}
            empty={t('dq.empty')}
          />
        </TabsContent>
        <TabsContent value="charts"><QualityCharts rows={rows} active={active} /></TabsContent>
      </Tabs>
      {dialog && (
        <BulkDialog
          kind={dialog.kind}
          count={dialog.ids.length}
          onClose={() => setDialog(null)}
          onConfirm={(text) => {
            if (dialog.kind === 'assign') {
              const tasks = assignToAgents(orgId, dialog.ids, userId ?? 'system', text || undefined);
              toast.success(t('dq.assigned', { count: tasks.length, agents: [...new Set(tasks.map((x) => lk.agent(x.agentId)))].join(', ') }));
            } else {
              markValid(orgId, dialog.ids, text, userId ?? 'system');
              toast.success(t('dq.markedValid', { count: dialog.ids.length }));
            }
            dialog.clear();
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

function BulkDialog({ kind, count, onClose, onConfirm }: { kind: 'assign' | 'valid'; count: number; onClose: () => void; onConfirm: (text: string) => void }) {
  const { t } = useT();
  const [text, setText] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(kind === 'assign' ? 'dq.assignTitle' : 'dq.validTitle', { count })}</DialogTitle>
          <DialogDescription>{t(kind === 'assign' ? 'dq.assignHint' : 'dq.validHint')}</DialogDescription>
        </DialogHeader>
        <Input compact autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t(kind === 'assign' ? 'dq.notePlaceholder' : 'dq.reasonPlaceholder')} aria-label={t(kind === 'assign' ? 'dq.note' : 'dq.reason')} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={kind === 'valid' && !text.trim()} onClick={() => onConfirm(text.trim())}>{t(kind === 'assign' ? 'dq.send' : 'dq.markValid')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QualityCharts({ rows, active }: { rows: (QualityIssue & { rule?: Parameters<typeof ruleLabel>[0] })[]; active: (QualityIssue & { rule?: Parameters<typeof ruleLabel>[0] })[] }) {
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const tally = (list: typeof rows, key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  };
  const weeks = useMemo(() => {
    const start = (d: string) => {
      const x = new Date(d);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return x.toISOString().slice(0, 10);
    };
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const k = start(r.createdAt);
      const cur = m.get(k) ?? {};
      cur[r.source] = (cur[r.source] ?? 0) + 1;
      m.set(k, cur);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).slice(-10).map(([k, v]) => ({ label: f.date(k, 'd MMM'), ...Object.fromEntries(SOURCES.map((s) => [s, v[s] ?? 0])) }));
  }, [rows, f]);
  const panel = (title: string, body: React.ReactNode) => <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[14px] font-semibold text-ink">{title}</h3>{body}</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {panel(t('dq.byRule'), active.length ? <HBars data={tally(active, (r) => ruleLabel(r.rule, t))} format={(v) => f.number(v)} /> : <p className="text-[14px] text-muted">{t('dq.empty')}</p>)}
        {panel(t('dq.byAgent', { agent: terms.agent.toLocaleLowerCase() }), active.length ? <HBars data={tally(active, (r) => lk.agent(r.agentId)).slice(0, 8)} format={(v) => f.number(v)} /> : <p className="text-[14px] text-muted">{t('dq.empty')}</p>)}
      </div>
      {panel(t('dq.trend'), <StackedColumns data={weeks} series={SOURCES.filter((s) => weeks.some((w) => (w as Record<string, number | string>)[s])).map((s) => ({ key: s, label: t(`dq.sourceName.${s}`), index: SOURCES.indexOf(s) }))} format={(v) => f.number(v)} />)}
    </div>
  );
}
