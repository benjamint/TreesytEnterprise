import { useMemo, useState } from 'react';
import { PageTourButton } from '@/components/shared/PageHeader';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Check, Download, MessageSquareWarning, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FormRecord, SurveyResponse } from '@/types';
import type { FormSchema, Question } from '@/engines/forms';
import { allQuestions, validateAnswers } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/shared/Field';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { AnswersView, FormRenderer, answerText } from '@/components/forms/FormFields';
import { Photo } from '@/components/forms/media';
import { qLabel } from '@/components/forms/QuestionInput';
import { HBars, StackedColumns } from '@/components/charts/charts';
import { NotFound } from '@/app/guards';
import { editResponse, latestVersion, materialize, reviewResponse } from '@/services/formService';
import { cn } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormStore } from '@/stores/formStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLocationStore } from '@/stores/locationStore';
import { useActor, useCan, useCurrentOrg, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';

export const RESPONSE_TONE = { SUBMITTED: 'info', APPROVED: 'success', REJECTED: 'danger', NEEDS_FIX: 'warning' } as const;
const SUBJECT_LINK = { farmer: '/app/farmers', community: '/app/communities', farmerGroup: '/app/groups' } as const;

/** Schema a response was captured with (records keep their version). */
export function schemaFor(form: FormRecord, version: number, lists: Parameters<typeof materialize>[1]): FormSchema {
  const v = form.versions.find((x) => x.version === version) ?? latestVersion(form);
  return materialize(v?.schema ?? form.draft, lists);
}

function useSubjects() {
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  return useMemo(() => {
    const m = new Map<string, { name: string; communityId?: string }>();
    for (const f of farmers) m.set(f.id, { name: `${f.firstName} ${f.lastName}`, communityId: f.communityId });
    for (const c of communities) m.set(c.id, { name: c.name, communityId: c.id });
    for (const g of groups) m.set(g.id, { name: g.name, communityId: g.communityId });
    return m;
  }, [farmers, communities, groups]);
}

/** Survey responses (PRD G2): table, detail with review, analytics, export. */
export function ResponsesPage() {
  const { formId } = useParams();
  const form = useFormStore((s) => s.forms.find((f) => f.id === formId));
  const { orgId } = useActor();
  if (!form || form.orgId !== orgId) return <NotFound />;
  return <Responses form={form} />;
}

function Responses({ form }: { form: FormRecord }) {
  const { t, terms } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const lk = useLookups();
  const subjects = useSubjects();
  const settings = useOrgSettings();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const all = useFormStore((s) => s.responses);
  const lists = useOrgRows(useFormStore((s) => s.optionLists));
  const [openId, openDrawer, closeDrawer] = useDrawerParam();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [agent, setAgent] = useState('');
  const [version, setVersion] = useState('');
  const [region, setRegion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const regionOf = useMemo(() => {
    const top = settings.locationLevels[0]?.id;
    const comNode = new Map(lk.communities.map((c) => [c.id, c.locationNodeId]));
    return (communityId?: string) => {
      let n = nodes.find((x) => x.id === comNode.get(communityId ?? ''));
      while (n && n.levelId !== top) n = nodes.find((x) => x.id === n!.parentId);
      return n?.id;
    };
  }, [nodes, lk.communities, settings.locationLevels]);

  const rows = useMemo(() => all.filter((r) => r.formId === form.id).map((r) => {
    const sub = r.subject ? subjects.get(r.subject.id) : undefined;
    const agentCom = lk.communities.find((c) => c.agentIds.includes(r.agentId ?? ''))?.id;
    return { ...r, subjectName: sub?.name ?? '', agentName: lk.agent(r.agentId), region: regionOf(sub?.communityId ?? agentCom) };
  }), [all, form.id, subjects, lk, regionOf]);
  type Row = (typeof rows)[number];
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!query || r.number.toLowerCase().includes(query) || r.subjectName.toLowerCase().includes(query)) && (!status || r.status === status) && (!agent || r.agentId === agent) && (!version || String(r.version) === version) && (!region || r.region === region) && (!from || r.submittedAt.slice(0, 10) >= from) && (!to || r.submittedAt.slice(0, 10) <= to));

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'number', header: t('forms.r.id'), accessorKey: 'number', cell: (c) => <span className="font-mono text-[13px] text-ink">{c.getValue() as string}{c.row.original.test && <Badge tone="info" className="ml-1.5">{t('forms.r.test')}</Badge>}</span> },
    { id: 'version', header: t('set.forms.version'), accessorKey: 'version', cell: (c) => t('set.forms.v', { n: c.getValue() as number }) },
    { id: 'subject', header: t('forms.subject'), accessorKey: 'subjectName', cell: (c) => c.getValue() || <span className="text-muted">{'—'}</span> },
    { id: 'agent', header: terms.agent, accessorKey: 'agentName' },
    { id: 'date', header: t('col.date'), accessorKey: 'submittedAt', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'gps', header: t('forms.r.gps'), accessorFn: (r) => r.gps?.accuracy ?? 999, cell: (c) => (c.row.original.gps ? <span className={cn('tnum', c.row.original.gps.accuracy > 20 ? 'text-warning' : 'text-body')}>{t('form.media.accuracy', { m: c.row.original.gps.accuracy })}</span> : '—') },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={RESPONSE_TONE[c.getValue() as SurveyResponse['status']]}>{t(`forms.r.status.${c.getValue() as string}`)}</Badge> },
    { id: 'completion', header: t('forms.r.completion'), accessorKey: 'completion', cell: (c) => <span className="flex items-center gap-2"><span className="h-1.5 w-14 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-brand" style={{ width: `${c.getValue() as number}%` }} /></span><span className="tnum text-[13px]">{c.getValue() as number}%</span></span> },
  ], [t, f, terms]);

  const current = rows.find((r) => r.id === openId);
  const versions = [...new Set(rows.map((r) => r.version))].sort((a, b) => b - a);
  const filters = (
    <FilterBar
      search={q}
      onSearch={setQ}
      placeholder={t('forms.r.search')}
      filters={[
        { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: (['SUBMITTED', 'APPROVED', 'NEEDS_FIX', 'REJECTED'] as const).map((s) => ({ value: s, label: t(`forms.r.status.${s}`) })) },
        { key: 'agent', label: terms.agent, value: agent, onChange: setAgent, options: lk.agents.filter((a) => rows.some((r) => r.agentId === a.id)).map((a) => ({ value: a.id, label: lk.agent(a.id) })) },
        { key: 'region', label: t('col.location'), value: region, onChange: setRegion, options: nodes.filter((n) => rows.some((r) => r.region === n.id)).map((n) => ({ value: n.id, label: n.name })) },
        { key: 'version', label: t('set.forms.version'), value: version, onChange: setVersion, options: versions.map((v) => ({ value: String(v), label: t('set.forms.v', { n: v }) })) },
      ]}
      extra={<span className="flex items-center gap-1.5"><Input compact type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('forms.r.from')} className="w-[150px]" /><span className="text-muted">{'–'}</span><Input compact type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('forms.r.to')} className="w-[150px]" /></span>}
      onClear={() => { setQ(''); setStatus(''); setAgent(''); setVersion(''); setRegion(''); setFrom(''); setTo(''); }}
    />
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={`/app/forms/${form.id}`} className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowLeft className="h-3.5 w-3.5" /> {form.name}</Link>
          <span className="flex min-w-0 items-center gap-2"><h1 data-tour="page-title" className="text-[28px] font-semibold text-ink">{t('forms.responses')}</h1><PageTourButton /></span>
          <p className="text-[14px] text-muted">{t('forms.r.summary', { count: rows.length, shown: shown.length })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate(`/app/forms/${form.id}`)}><Pencil /> {t('forms.openBuilder')}</Button>
          <Button variant="secondary" onClick={() => setExporting(true)}><Download /> {t('forms.r.export')}</Button>
        </div>
      </div>
      <Tabs defaultValue="table">
        <TabsList className="mb-5">
          <TabsTrigger value="table">{t('forms.r.table')}</TabsTrigger>
          <TabsTrigger value="analytics">{t('forms.r.analytics')}</TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          {filters}
          <DataTable columns={columns} data={[...shown].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))} getRowId={(r) => r.id} onRowClick={(r) => openDrawer(r.id)} activeId={openId} empty={t('forms.r.empty')} />
        </TabsContent>
        <TabsContent value="analytics">{filters}<Analytics form={form} rows={shown} lists={lists} /></TabsContent>
      </Tabs>
      {current && <ResponseDrawer key={current.id} form={form} r={current} lists={lists} onClose={closeDrawer} />}
      {exporting && <ExportDialog form={form} rows={shown} lists={lists} onClose={() => setExporting(false)} />}
    </>
  );
}

function ResponseDrawer({ form, r, lists, onClose }: { form: FormRecord; r: SurveyResponse & { subjectName: string; agentName: string }; lists: Parameters<typeof materialize>[1]; onClose: () => void }) {
  const { userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lk = useLookups();
  const navigate = useNavigate();
  const can = useCan();
  const schema = useMemo(() => schemaFor(form, r.version, lists), [form, r.version, lists]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.answers);
  const [review, setReview] = useState<'NEEDS_FIX' | 'REJECTED' | null>(null);
  const [comment, setComment] = useState('');
  const masked = can('farmers.viewSensitive') ? [] : allQuestions(schema).filter((q) => q.sensitive).map((q) => q.id);
  const errors = editing ? validateAnswers(schema, draft) : [];
  const act = (action: 'APPROVED' | 'REJECTED' | 'NEEDS_FIX', text?: string) => {
    const task = reviewResponse(r.id, action, userId ?? 'system', text);
    toast.success(t(`forms.r.done.${action}`, { number: r.number, agent: r.agentName }));
    if (action === 'NEEDS_FIX' && !task) toast.warning(t('forms.r.noAgent'));
    setReview(null);
  };
  return (
    <>
    <DetailDrawer
      open
      onClose={onClose}
      title={r.number}
      subtitle={`${form.name} · ${t('set.forms.v', { n: r.version })} · ${f.dateTime(r.submittedAt)}`}
      badges={<><Badge tone={RESPONSE_TONE[r.status]}>{t(`forms.r.status.${r.status}`)}</Badge><Badge tone="neutral">{t('forms.complete', { pct: r.completion })}</Badge>{r.test && <Badge tone="info">{t('forms.r.test')}</Badge>}</>}
      actions={
        <PermissionGate permission="forms.reviewResponses">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={r.status === 'APPROVED'} onClick={() => act('APPROVED')}><Check /> {t('forms.r.approve')}</Button>
            <Button size="sm" variant="secondary" onClick={() => { setComment(''); setReview('NEEDS_FIX'); }}><MessageSquareWarning /> {t('forms.r.sendBack')}</Button>
            <Button size="sm" variant="secondary" disabled={r.status === 'REJECTED'} onClick={() => { setComment(''); setReview('REJECTED'); }}><X /> {t('forms.r.reject')}</Button>
            {!editing && <Button size="sm" variant="ghost" onClick={() => { setDraft(r.answers); setEditing(true); }}><Pencil /> {t('people.edit')}</Button>}
          </div>
        </PermissionGate>
      }
      tabs={[
        {
          key: 'answers', label: t('forms.r.answers'), content: editing ? (
            <div className="space-y-4">
              <FormRenderer form={schema} answers={draft} onChange={setDraft} errors={errors} columns={1} />
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
                <Button disabled={errors.length > 0} onClick={() => { const n = editResponse(r.id, draft, schema, userId ?? 'system'); toast.success(t('forms.r.edited', { count: n })); setEditing(false); }}>{t('common.save')}</Button>
              </div>
            </div>
          ) : <AnswersView form={schema} answers={r.answers} masked={masked} />,
        },
        {
          key: 'context', label: t('forms.r.context'), content: (
            <div className="space-y-5">
              <Facts items={[
                [t('forms.subject'), r.subject ? <button type="button" className="text-brand hover:underline" onClick={() => navigate(`${SUBJECT_LINK[r.subject!.entity]}?open=${r.subject!.id}`)}>{r.subjectName}</button> : '—'],
                [terms.agent, r.agentName], [t('forms.r.started'), r.startedAt ? f.dateTime(r.startedAt) : '—'], [t('forms.r.submitted'), f.dateTime(r.submittedAt)],
                [t('forms.r.device'), t(`people.device.${r.device}`)], [t('forms.r.gps'), r.gps ? t('form.media.accuracy', { m: r.gps.accuracy }) : '—'],
              ]} />
              {r.gps && (
                <div className="h-56 overflow-hidden rounded-ctl border border-line">
                  <MapContainer center={[r.gps.lat, r.gps.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <CircleMarker center={[r.gps.lat, r.gps.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#14583F', fillOpacity: 1 }} />
                    <CircleMarker center={[r.gps.lat, r.gps.lng]} radius={Math.min(40, 6 + r.gps.accuracy)} pathOptions={{ color: '#14583F', weight: 1, fillOpacity: 0.08 }} />
                  </MapContainer>
                </div>
              )}
            </div>
          ),
        },
        {
          key: 'review', label: t('forms.r.reviewTab'), count: r.reviews.length, content: r.reviews.length ? (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {[...r.reviews].reverse().map((x, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
                  <div className="text-[14px] text-ink">{t(`forms.r.action.${x.action}`, { count: x.fields?.length ?? 0 })}</div>
                  {x.comment && <div className="mt-0.5 rounded-ctl bg-canvas px-3 py-1.5 text-[13px] text-body">{x.comment}</div>}
                  <div className="text-[12px] text-muted">{lk.user(x.by)} · {f.dateTime(x.at)}</div>
                </li>
              ))}
            </ol>
          ) : <TabEmpty>{t('forms.r.noReviews')}</TabEmpty>,
        },
      ]}
    />
      {review && (
        <Dialog open onOpenChange={(o) => !o && setReview(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(review === 'NEEDS_FIX' ? 'forms.r.sendBackTitle' : 'forms.r.rejectTitle', { number: r.number })}</DialogTitle>
              <DialogDescription>{t(review === 'NEEDS_FIX' ? 'forms.r.sendBackHint' : 'forms.r.rejectHint', { agent: r.agentName })}</DialogDescription>
            </DialogHeader>
            <textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} rows={3} aria-label={t('forms.r.comment')} placeholder={t('forms.r.commentPlaceholder')} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink" />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setReview(null)}>{t('common.cancel')}</Button>
              <Button variant={review === 'REJECTED' ? 'danger' : 'primary'} disabled={!comment.trim()} onClick={() => act(review, comment.trim())}>{t(review === 'NEEDS_FIX' ? 'forms.r.sendBack' : 'forms.r.reject')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Analytics

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export function QuestionSummary({ q, values, total }: { q: Question; values: unknown[]; total: number }) {
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const answered = values.filter((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  const pct = (n: number) => `${f.number(total ? (n / total) * 100 : 0, { maximumFractionDigits: 0 })}%`;
  const head = <div className="mb-3 flex items-start justify-between gap-3"><h4 className="text-[14px] font-semibold text-ink">{qLabel(q, lang)}</h4><span className="whitespace-nowrap text-[12px] text-muted">{t('forms.a.answered', { n: f.number(answered.length), total: f.number(total) })}</span></div>;
  let body: React.ReactNode = null;
  if (q.type === 'yesNo' || q.type === 'selectOne' || q.type === 'selectMany' || q.type === 'ranking') {
    const counts = new Map<string, number>();
    for (const v of answered) for (const x of q.type === 'ranking' ? [(v as string[])[0]] : Array.isArray(v) ? v : [v]) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
    const opts = q.type === 'yesNo' ? [{ value: 'true', label: { en: t('common.yes'), fr: t('common.yes') } }, { value: 'false', label: { en: t('common.no'), fr: t('common.no') } }] : q.options ?? [];
    const data = opts.map((o) => ({ label: answerText({ ...q, type: q.type === 'yesNo' ? 'shortText' : 'selectOne' } as Question, q.type === 'yesNo' ? (o.label[lang] ?? o.label.en) : o.value, t, lang), value: counts.get(o.value) ?? 0 })).sort((a, b) => b.value - a.value);
    body = <>{q.type === 'ranking' && <p className="mb-2 text-[12px] text-muted">{t('forms.a.rankedFirst')}</p>}<HBars data={data} format={(v) => `${f.number(v)} · ${pct(v)}`} /></>;
  } else if (['rating', 'likert', 'nps'].includes(q.type)) {
    const nums = answered.map(Number);
    const max = q.type === 'nps' ? 10 : q.scale?.max ?? 5;
    const min = q.type === 'nps' ? 0 : 1;
    const avg = nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0;
    const promoters = nums.filter((x) => x >= 9).length, detractors = nums.filter((x) => x <= 6).length;
    body = (
      <>
        <div className="mb-3 flex flex-wrap gap-6">
          <div><div className="eyebrow">{t('forms.a.average')}</div><div className="tnum text-[24px] font-semibold text-ink">{f.number(avg, { maximumFractionDigits: 1 })}<span className="text-[14px] text-muted"> / {max}</span></div></div>
          {q.type === 'nps' && <div><div className="eyebrow">{t('forms.a.nps')}</div><div className="tnum text-[24px] font-semibold text-ink">{f.number(nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : 0)}</div><div className="text-[12px] text-muted">{t('forms.a.npsSplit', { p: pct(promoters), d: pct(detractors) })}</div></div>}
        </div>
        <HBars data={Array.from({ length: max - min + 1 }, (_, i) => max - i).map((v) => ({ label: String(v), value: nums.filter((x) => x === v).length }))} format={(v) => f.number(v)} />
      </>
    );
  } else if (['number', 'decimal', 'currency', 'calculated', 'year'].includes(q.type)) {
    const nums = answered.map(Number).filter(Number.isFinite);
    const stats = nums.length ? [[t('forms.a.average'), nums.reduce((s, x) => s + x, 0) / nums.length], [t('forms.a.median'), median(nums)], [t('set.commodities.min'), Math.min(...nums)], [t('set.commodities.max'), Math.max(...nums)]] as const : [];
    body = <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{stats.map(([k, v]) => <div key={k} className="rounded-ctl bg-canvas p-3"><div className="eyebrow">{k}</div><div className="tnum mt-1 text-[18px] font-semibold text-ink">{f.number(v, { maximumFractionDigits: 1 })}</div></div>)}</div>;
  } else if (q.type === 'image') {
    body = <div className="flex flex-wrap gap-2">{answered.slice(0, 8).flatMap((v) => (v as string[]).slice(0, 1)).map((p, i) => <Photo key={i} src={p} className="h-14 w-20 rounded-[8px] border border-line" />)}</div>;
  } else if (['shortText', 'longText', 'email', 'phone', 'contact'].includes(q.type)) {
    body = <ul className="space-y-1 text-[13px] text-body">{answered.slice(0, 4).map((v, i) => <li key={i} className="rounded-ctl bg-canvas px-3 py-1.5">{answerText(q, v, t, lang)}</li>)}</ul>;
  } else body = <p className="text-[13px] text-muted">{t('forms.a.captured', { n: f.number(answered.length) })}</p>;
  return <div className="rounded-card border border-line bg-surface p-5 shadow-soft">{head}{body}</div>;
}

function Analytics({ form, rows, lists }: { form: FormRecord; rows: SurveyResponse[]; lists: Parameters<typeof materialize>[1] }) {
  const { t } = useT();
  const f = useFormat();
  const schema = useMemo(() => schemaFor(form, latestVersion(form)?.version ?? 0, lists), [form, lists]);
  const weeks = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const d = new Date(r.submittedAt); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).slice(-16).map(([k, n]) => ({ label: f.date(k, 'd MMM'), responses: n }));
  }, [rows, f]);
  const gps = rows.filter((r) => r.gps);
  const bounds = gps.length ? ([[Math.min(...gps.map((r) => r.gps!.lat)) - 0.05, Math.min(...gps.map((r) => r.gps!.lng)) - 0.05], [Math.max(...gps.map((r) => r.gps!.lat)) + 0.05, Math.max(...gps.map((r) => r.gps!.lng)) + 0.05]] as [[number, number], [number, number]]) : null;
  const avgCompletion = rows.length ? rows.reduce((s, r) => s + r.completion, 0) / rows.length : 0;
  if (!rows.length) return <TabEmpty>{t('forms.r.empty')}</TabEmpty>;
  const card = (k: string, v: string) => <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><div className="eyebrow">{k}</div><div className="tnum mt-2 text-[28px] font-semibold text-ink">{v}</div></div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        {card(t('forms.responses'), f.number(rows.length))}
        {card(t('forms.a.completion'), `${f.number(avgCompletion, { maximumFractionDigits: 0 })}%`)}
        {card(t('forms.a.approved'), `${f.number((rows.filter((r) => r.status === 'APPROVED').length / rows.length) * 100, { maximumFractionDigits: 0 })}%`)}
        {card(t('forms.a.agents'), f.number(new Set(rows.map((r) => r.agentId)).size))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-surface p-5 shadow-soft"><h3 className="mb-3 text-[15px] font-semibold text-ink">{t('forms.a.overTime')}</h3><StackedColumns data={weeks} series={[{ key: 'responses', label: t('forms.responses'), index: 0 }]} format={(v) => f.number(v)} /></div>
        <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">{t('forms.a.map')}</h3>
          <div className="h-[260px] overflow-hidden rounded-ctl border border-line">
            {bounds && <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{gps.slice(0, 400).map((r) => <CircleMarker key={r.id} center={[r.gps!.lat, r.gps!.lng]} radius={4} pathOptions={{ color: '#fff', weight: 1, fillColor: '#2a78d6', fillOpacity: 0.85 }} />)}</MapContainer>}
          </div>
        </div>
      </div>
      <h3 className="pt-2 text-[17px] font-semibold text-ink">{t('forms.a.byQuestion')}</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {allQuestions(schema).filter((q) => q.type !== 'note' && !q.sensitive).map((q) => <QuestionSummary key={q.id} q={q} values={rows.map((r) => r.answers[q.id])} total={rows.length} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Export

function ExportDialog({ form, rows, lists, onClose }: { form: FormRecord; rows: (SurveyResponse & { subjectName: string; agentName: string })[]; lists: Parameters<typeof materialize>[1]; onClose: () => void }) {
  const { t, terms } = useT();
  const lang = useLang();
  const org = useCurrentOrg();
  const can = useCan();
  const schema = useMemo(() => schemaFor(form, latestVersion(form)?.version ?? 0, lists), [form, lists]);
  const qs = allQuestions(schema).filter((q) => q.type !== 'note');
  const META = ['number', 'version', 'subject', 'agent', 'submittedAt', 'status', 'completion', 'gps'] as const;
  const [cols, setCols] = useState<string[]>([...META, ...qs.map((q) => q.id)]);
  const seeSensitive = can('farmers.viewSensitive');
  const metaLabel = (k: (typeof META)[number]) => ({ number: t('forms.r.id'), version: t('set.forms.version'), subject: t('forms.subject'), agent: terms.agent, submittedAt: t('forms.r.submitted'), status: t('col.status'), completion: t('forms.r.completion'), gps: t('forms.r.gps') })[k];
  const run = async () => {
    const XLSX = await import('xlsx');
    const head = [...META.filter((k) => cols.includes(k)).map(metaLabel), ...qs.filter((q) => cols.includes(q.id)).map((q) => qLabel(q, lang))];
    const data = rows.map((r) => [
      ...META.filter((k) => cols.includes(k)).map((k) => (k === 'subject' ? r.subjectName : k === 'agent' ? r.agentName : k === 'gps' ? (r.gps ? `${r.gps.lat.toFixed(5)}, ${r.gps.lng.toFixed(5)}` : '') : k === 'status' ? t(`forms.r.status.${r.status}`) : String(r[k] ?? ''))),
      ...qs.filter((q) => cols.includes(q.id)).map((q) => (q.sensitive && !seeSensitive ? t('form.masked') : answerText(q, r.answers[q.id], t, lang, r.answers[`${q.id}__other`]).replace(/^—$/, ''))),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...data]), 'Responses');
    XLSX.writeFile(wb, `${org.code.toLowerCase()}-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`);
    toast.success(t('forms.r.exported', { count: rows.length }));
    onClose();
  };
  const toggle = (id: string, on: boolean) => setCols(on ? [...cols, id] : cols.filter((x) => x !== id));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('forms.r.exportTitle', { count: rows.length })}</DialogTitle>
          <DialogDescription>{seeSensitive ? t('forms.r.exportHint') : t('forms.r.exportMasked')}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] gap-x-6 gap-y-2 overflow-y-auto sm:grid-cols-2">
          {META.map((k) => <Checkbox key={k} label={metaLabel(k)} checked={cols.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />)}
          {qs.map((q) => <Checkbox key={q.id} label={<span>{qLabel(q, lang)}{q.sensitive && <Badge tone="warningOutline" className="ml-1.5">{t('forms.ins.sensitive')}</Badge>}</span>} checked={cols.includes(q.id)} onChange={(e) => toggle(q.id, e.target.checked)} />)}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void run()} disabled={!cols.length}><Download /> {t('forms.r.downloadXlsx')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
