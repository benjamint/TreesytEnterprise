import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { TopicAudience, TopicCategory, TrainingTopic } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { Checkbox, Field } from '@/components/shared/Field';
import { FilterBar } from '@/components/shared/ListKit';
import { TOPIC_TEMPLATES } from '@/data/templates/trainingTemplates';
import { addTemplateTopics, saveTopic } from '@/services/trainingService';
import { useFormStore } from '@/stores/formStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useTrainingLookups } from './WorkshopsPage';

const CATEGORIES: TopicCategory[] = ['AGRONOMY', 'CONSERVATION', 'FINANCE', 'SAFETY', 'QUALITY', 'SOCIAL'];
const AUDIENCES: TopicAudience[] = ['FARMERS', 'GROUPS', 'STAFF'];
const SECTORS = Object.keys(TOPIC_TEMPLATES);
const select = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';

/** Training catalogue (PRD G3): topics per language, category, duration, materials, quiz form, audience; starter templates by sector. */
export function TrainingCataloguePage() {
  const { t } = useT();
  const f = useFormat();
  const tl = useTrainingLookups();
  const workshops = useOrgRows(useTrainingStore((s) => s.workshops));
  const forms = useOrgRows(useFormStore((s) => s.forms));
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<TrainingTopic | 'new' | null>(null);
  const [starter, setStarter] = useState(false);
  const held = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workshops) if (w.status === 'HELD' || w.status === 'ARCHIVED') m.set(w.topicId, (m.get(w.topicId) ?? 0) + 1);
    return m;
  }, [workshops]);
  const query = q.trim().toLowerCase();
  const shown = tl.topics.filter((x) => (!category || x.category === category) && (!query || Object.values(x.name).some((n) => n?.toLowerCase().includes(query))));
  const columns = useMemo<ColumnDef<TrainingTopic, unknown>[]>(() => [
    { id: 'name', header: t('ws.topic'), accessorFn: (x) => tl.topicName(x.id), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'category', header: t('ws.category'), accessorKey: 'category', cell: (c) => t(`ws.cat.${c.getValue() as string}`) },
    { id: 'duration', header: t('ws.duration'), accessorKey: 'durationMin', cell: (c) => t('ws.minutes', { n: c.getValue() as number }) },
    { id: 'audience', header: t('ws.audience'), accessorKey: 'audience', cell: (c) => t(`ws.aud.${c.getValue() as string}`) },
    { id: 'materials', header: t('ws.materials'), accessorFn: (x) => x.materials.join(', ') || '—' },
    { id: 'quiz', header: t('ws.quiz'), accessorFn: (x) => forms.find((fm) => fm.id === x.quizFormId)?.name ?? '—' },
    { id: 'held', header: t('ws.held'), accessorFn: (x) => held.get(x.id) ?? 0, cell: (c) => f.number(c.getValue() as number) },
    { id: 'active', header: t('col.status'), accessorKey: 'active', cell: (c) => (c.getValue() ? <Badge tone="success">{t('ws.active')}</Badge> : <Badge tone="neutral">{t('ws.inactive')}</Badge>) },
  ], [t, f, tl, forms, held]);
  return (
    <>
      <PageHeader eyebrow={<Link to="/app/workshops" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> {t('nav.workshops')}</Link>} title={t('nav.trainingCatalogue')} description={t('pages.trainingCatalogue')}
        actions={<PermissionGate permission="workshops.create"><Button variant="secondary" onClick={() => setStarter(true)}><Sparkles /> {t('ws.starter')}</Button></PermissionGate>}
        primary={<PermissionGate permission="workshops.create"><Button onClick={() => setEditing('new')}><Plus /> {t('ws.newTopic')}</Button></PermissionGate>} />
      <FilterBar search={q} onSearch={setQ} placeholder={t('ws.searchTopics')}
        filters={[{ key: 'category', label: t('ws.category'), value: category, onChange: setCategory, options: CATEGORIES.map((c) => ({ value: c, label: t(`ws.cat.${c}`) })) }]}
        onClear={() => { setQ(''); setCategory(''); }} />
      <DataTable columns={columns} data={shown} getRowId={(x) => x.id} onRowClick={(x) => setEditing(x)} empty={t('ws.noTopics')}
        exportCsv={{ fileName: 'training-topics.csv', columns: [
          { header: 'EN', value: (x) => x.name.en ?? '' }, { header: 'FR', value: (x) => x.name.fr ?? '' }, { header: t('ws.category'), value: (x) => t(`ws.cat.${x.category}`) },
          { header: t('ws.duration'), value: (x) => x.durationMin }, { header: t('ws.audience'), value: (x) => t(`ws.aud.${x.audience}`) }, { header: t('ws.materials'), value: (x) => x.materials.join('; ') },
        ] }} />
      {editing && <TopicDialog topic={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {starter && <StarterDialog onClose={() => setStarter(false)} />}
    </>
  );
}

function TopicDialog({ topic, onClose }: { topic?: TrainingTopic; onClose: () => void }) {
  const { t } = useT();
  const org = useCurrentOrg();
  const { orgId, userId } = useActor();
  const forms = useOrgRows(useFormStore((s) => s.forms)).filter((fm) => fm.binding === 'survey' || fm.binding === 'workshopFeedback');
  const langs = org.languages.length ? org.languages : [org.language];
  const [v, setV] = useState({ name: topic?.name ?? {}, category: topic?.category ?? 'AGRONOMY', durationMin: String(topic?.durationMin ?? 90), audience: topic?.audience ?? 'FARMERS', materials: topic?.materials.join(', ') ?? '', quizFormId: topic?.quizFormId ?? '', active: topic?.active ?? true });
  const invalid = !langs.some((l) => v.name[l]?.trim()) || !(Number(v.durationMin) > 0);
  const save = () => {
    saveTopic({ orgId, name: v.name, category: v.category, durationMin: Number(v.durationMin), audience: v.audience, materials: v.materials.split(',').map((x) => x.trim()).filter(Boolean), quizFormId: v.quizFormId || undefined, active: v.active, actorId: userId ?? 'system' }, topic?.id);
    toast.success(t('ws.toast.topicSaved'));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{topic ? t('ws.editTopic') : t('ws.newTopic')}</DialogTitle><DialogDescription>{t('ws.topicHint')}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {langs.map((l) => <Field key={l} label={t('ws.nameIn', { lang: l.toUpperCase() })}><Input value={v.name[l] ?? ''} onChange={(e) => setV({ ...v, name: { ...v.name, [l]: e.target.value } })} aria-label={t('ws.nameIn', { lang: l.toUpperCase() })} /></Field>)}
          <Field label={t('ws.category')}><select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as TopicCategory })} aria-label={t('ws.category')} className={select}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`ws.cat.${c}`)}</option>)}</select></Field>
          <Field label={t('ws.durationMin')}><Input type="number" min={15} step={15} value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: e.target.value })} aria-label={t('ws.durationMin')} /></Field>
          <Field label={t('ws.audience')}><select value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value as TopicAudience })} aria-label={t('ws.audience')} className={select}>{AUDIENCES.map((a) => <option key={a} value={a}>{t(`ws.aud.${a}`)}</option>)}</select></Field>
          <Field label={t('ws.quiz')}><select value={v.quizFormId} onChange={(e) => setV({ ...v, quizFormId: e.target.value })} aria-label={t('ws.quiz')} className={select}><option value="">{t('ws.noQuiz')}</option>{forms.map((fm) => <option key={fm.id} value={fm.id}>{fm.name}</option>)}</select></Field>
          <Field label={t('ws.materials')} helper={t('ws.materialsHint')} className="sm:col-span-2"><Input value={v.materials} onChange={(e) => setV({ ...v, materials: e.target.value })} aria-label={t('ws.materials')} /></Field>
          <Checkbox label={t('ws.activeHint')} checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={invalid} onClick={save}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StarterDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const { orgId, userId } = useActor();
  const tl = useTrainingLookups();
  const [sector, setSector] = useState(SECTORS[0]!);
  const have = new Set(tl.topics.map((x) => (x.name.en ?? '').toLowerCase()));
  const list = TOPIC_TEMPLATES[sector] ?? [];
  const fresh = list.filter((x) => !have.has(x.en.toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('ws.starter')}</DialogTitle><DialogDescription>{t('ws.starterHint')}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ws.sector')}>
          {SECTORS.map((s) => <button key={s} type="button" aria-pressed={sector === s} onClick={() => setSector(s)} className={sector === s ? 'rounded-chip border border-brand bg-brand-soft px-3 py-1 text-[13px] font-medium text-ink' : 'rounded-chip border border-line px-3 py-1 text-[13px] text-muted hover:text-ink'}>{t(`ws.sectorName.${s}`)}</button>)}
        </div>
        <ul className="divide-y divide-line rounded-ctl border border-line text-[14px]">
          {list.map((x) => <li key={x.en} className="flex items-center justify-between gap-3 px-3 py-2"><span>{x.en} <span className="text-[12px] text-muted">{`· ${t(`ws.cat.${x.category}`)}`}</span></span>{have.has(x.en.toLowerCase()) && <Badge tone="neutral">{t('ws.inCatalogue')}</Badge>}</li>)}
        </ul>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!fresh.length} onClick={() => { const n = addTemplateTopics(orgId, list, userId ?? 'system'); toast.success(t('ws.toast.topicsAdded', { count: n })); onClose(); }}>{t('ws.addTopics', { count: fresh.length })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
