import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Flag, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentReport } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Field, TextAreaField } from '@/components/shared/Field';
import { FilePick } from '@/components/shared/FilePick';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { createReport, resolveReport, updateReport } from '@/services/teamService';
import { useAccessStore } from '@/stores/accessStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { ActivityFeed } from '@/web/features/people/shared';
import { mono } from '@/web/features/buying/common';
import { AgentName, FieldStatus, selectCls, useFieldLookups } from './shared';

const SEV_TONE = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'dark' } as const;
export function SeverityBadge({ severity }: { severity?: keyof typeof SEV_TONE }) {
  const { t } = useT();
  return severity ? <Badge tone={SEV_TONE[severity]}>{t(`rep.severity.${severity}`)}</Badge> : null;
}

/** Agent reports (PRD J10): category with severity and consequence, reason and files, status, assignee, due date, resolution. */
export function AgentReportsPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const rows = useOrgRows(useFieldStore((s) => s.reports));
  const [openId, open, close] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!status || r.status === status) && (!category || r.categoryId === category) && (!query || [r.number, fl.agentName(r.agentId), r.reason].some((x) => x.toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns = useMemo<ColumnDef<AgentReport, unknown>[]>(() => [
    { id: 'number', header: t('col.number'), accessorKey: 'number', cell: (c) => mono(c.getValue() as string) },
    { id: 'agent', header: t('col.agent'), accessorFn: (r) => fl.agentName(r.agentId), cell: (c) => <AgentName id={c.row.original.agentId} /> },
    { id: 'category', header: t('rep.category'), accessorFn: (r) => fl.issue(r.categoryId)?.name ?? '' },
    { id: 'severity', header: t('rep.severityCol'), accessorFn: (r) => fl.issue(r.categoryId)?.severity ?? '', cell: (c) => <SeverityBadge severity={c.getValue() as never} /> },
    { id: 'consequence', header: t('set.field.consequence'), accessorFn: (r) => fl.issue(r.categoryId)?.consequence ?? '', cell: (c) => t(`set.field.consequenceName.${c.getValue() as string}`) },
    { id: 'assignee', header: t('rep.assignee'), accessorFn: (r) => fl.user(r.assigneeId) },
    { id: 'due', header: t('rep.due'), accessorKey: 'dueDate', cell: (c) => { const r = c.row.original; return r.dueDate ? <span className={r.status !== 'RESOLVED' && r.dueDate < today ? 'font-medium text-danger' : ''}>{f.date(r.dueDate)}</span> : '—'; } },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <FieldStatus status={c.getValue() as string} /> },
  ], [t, f, fl, today]);
  const current = rows.find((r) => r.id === openId);
  const cats = useOrgSettings().fieldTeam.issueCategories;
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.agentReports')} description={t('pages.agentReports')}
        primary={<PermissionGate permission="agentReports.create"><Button onClick={() => setCreating(true)}><Plus /> {t('rep.new')}</Button></PermissionGate>} />
      <div className="mb-5 stat-strip grid gap-3 sm:grid-cols-3">
        <StatCard label={t('field.status.OPEN')} value={f.number(rows.filter((r) => r.status === 'OPEN').length)} icon={Flag} onClick={() => setStatus('OPEN')} />
        <StatCard label={t('field.status.IN_PROGRESS')} value={f.number(rows.filter((r) => r.status === 'IN_PROGRESS').length)} onClick={() => setStatus('IN_PROGRESS')} />
        <StatCard label={t('rep.blocking')} value={f.number(rows.filter((r) => r.status !== 'RESOLVED' && fl.issue(r.categoryId)?.consequence !== 'FLAG').length)} hint={t('rep.blockingHint')} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('rep.search')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((s) => ({ key: s, label: t(`field.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: rows.filter((r) => r.status === s).length }))]}
        filters={[{ key: 'category', label: t('rep.category'), value: category, onChange: setCategory, options: cats.map((c) => ({ value: c.id, label: c.name })) }]}
        onClear={() => { setQ(''); setStatus(''); setCategory(''); }} />
      <DataTable columns={columns} data={shown} onRowClick={(r) => open(r.id)} activeId={openId} getRowId={(r) => r.id} empty={t('rep.none')}
        exportCsv={{ fileName: 'agent-reports.csv', columns: [{ header: t('col.number'), value: (r) => r.number }, { header: t('col.agent'), value: (r) => fl.agentName(r.agentId) }, { header: t('rep.category'), value: (r) => fl.issue(r.categoryId)?.name ?? '' }, { header: t('col.status'), value: (r) => r.status }, { header: t('field.reason'), value: (r) => r.reason }] }} />
      {current && <ReportDrawer key={current.id} r={current} onClose={close} />}
      {creating && <NewReportDialog onClose={(id) => { setCreating(false); if (id) open(id); }} />}
    </>
  );
}

function ReportDrawer({ r, onClose }: { r: AgentReport; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const { userId } = useActor();
  const cat = fl.issue(r.categoryId);
  const [resolving, setResolving] = useState(false);
  return (
    <>
      <DetailDrawer open onClose={onClose} title={fl.agentName(r.agentId)} subtitle={`${r.number} · ${cat?.name ?? ''}`}
        badges={<><FieldStatus status={r.status} /><SeverityBadge severity={cat?.severity} /></>}
        actions={<>
          {r.status === 'OPEN' && <PermissionGate permission="agentReports.create"><Button size="sm" variant="secondary" onClick={() => { updateReport(r.id, { status: 'IN_PROGRESS' }, userId ?? 'system'); toast.success(t('rep.toast.inProgress')); }}>{t('rep.start')}</Button></PermissionGate>}
          {r.status !== 'RESOLVED' && <PermissionGate permission="agentReports.resolve"><Button size="sm" onClick={() => setResolving(true)}>{t('rep.resolve')}</Button></PermissionGate>}
          {r.status === 'RESOLVED' && <PermissionGate permission="agentReports.resolve"><Button size="sm" variant="secondary" onClick={() => updateReport(r.id, { status: 'OPEN' }, userId ?? 'system')}>{t('rep.reopen')}</Button></PermissionGate>}
        </>}
        tabs={[
          {
            key: 'details', label: t('field.tab.details'), content: (
              <div className="space-y-4">
                {r.status !== 'RESOLVED' && cat && cat.consequence !== 'FLAG' && <p className="rounded-ctl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-ink" role="status">{t(`rep.effect.${cat.consequence}`)}</p>}
                <Facts items={[
                  [t('field.reason'), r.reason], [t('rep.reportedBy'), `${fl.user(r.createdBy)} · ${f.dateTime(r.createdAt)}`],
                  [t('set.field.consequence'), cat ? t(`set.field.consequenceName.${cat.consequence}`) : '—'], [t('rep.assignee'), fl.user(r.assigneeId)],
                  [t('rep.due'), r.dueDate ? f.date(r.dueDate) : '—'], [t('rep.files'), r.files.join(', ') || '—'],
                  ...(r.resolution ? [[t('rep.resolution'), `${r.resolution.comment} · ${fl.user(r.resolution.by)} · ${f.dateTime(r.resolution.at)}`] as [string, string]] : []),
                ]} />
                <h4 className="text-[13px] font-semibold text-ink">{t('rep.responses')}</h4>
                {r.responses.length ? <ul className="space-y-2">{r.responses.map((x, i) => <li key={i} className="rounded-ctl bg-canvas px-3 py-2 text-[13px]"><p className="text-ink">{x.text}</p><p className="text-[12px] text-muted">{`${fl.user(x.by)} · ${f.dateTime(x.at)}`}</p></li>)}</ul> : <p className="text-[13px] text-muted">{t('rep.noResponse')}</p>}
              </div>
            ),
          },
          { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="agentReport" entityId={r.id} /> },
        ]} />
      {resolving && <ResolveDialog r={r} onClose={() => setResolving(false)} />}
    </>
  );
}

function ResolveDialog({ r, onClose }: { r: AgentReport; onClose: () => void }) {
  const { t } = useT();
  const { userId } = useActor();
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<string>();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('rep.resolveTitle', { number: r.number })}</DialogTitle><DialogDescription>{t('rep.resolveHint')}</DialogDescription></DialogHeader>
        <TextAreaField label={t('rep.resolution')} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        <FilePick label={t('rep.files')} value={file} onChange={setFile} sample="resolution.pdf" />
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!comment.trim()} onClick={() => { try { resolveReport(r.id, comment, file ? [file] : [], userId ?? 'system'); toast.success(t('rep.toast.resolved')); onClose(); } catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); } }}>{t('rep.resolve')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewReportDialog({ agentId: fixed, onClose }: { agentId?: string; onClose: (id?: string) => void }) {
  const { t } = useT();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const memberships = useAccessStore((s) => s.memberships);
  const cats = settings.fieldTeam.issueCategories;
  const [agentId, setAgentId] = useState(fixed ?? fl.agents[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<string>();
  const office = memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE' && !fl.agents.some((a) => a.userId === m.userId)).map((m) => m.userId);
  const [assigneeId, setAssigneeId] = useState(office.includes(userId ?? '') ? userId! : office[0] ?? '');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const cat = cats.find((c) => c.id === categoryId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('rep.new')}</DialogTitle><DialogDescription>{cat ? t(`rep.effect.${cat.consequence}`) : ''}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!fixed && <Field label={t('col.agent')}><select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label={t('col.agent')} className={selectCls}>{fl.agents.map((a) => <option key={a.id} value={a.id}>{fl.agentName(a.id)}</option>)}</select></Field>}
          <Field label={t('rep.category')}><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t('rep.category')} className={selectCls}>{cats.map((c) => <option key={c.id} value={c.id}>{`${c.name} · ${t(`rep.severity.${c.severity}`)}`}</option>)}</select></Field>
          <Field label={t('rep.assignee')}><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label={t('rep.assignee')} className={selectCls}>{office.map((u) => <option key={u} value={u}>{fl.user(u)}</option>)}</select></Field>
          <Field label={t('rep.due')}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label={t('rep.due')} /></Field>
        </div>
        <TextAreaField label={t('field.reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <FilePick label={t('rep.files')} value={file} onChange={setFile} sample="evidence.jpg" />
        <DialogFooter><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={!reason.trim() || !agentId} onClick={() => { const r = createReport({ orgId, agentId, categoryId, reason, files: file ? [file] : [], assigneeId, dueDate, actorId: userId ?? 'system' }); toast.success(t('rep.toast.created', { number: r.number })); onClose(r.id); }}>{t('rep.submit')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
