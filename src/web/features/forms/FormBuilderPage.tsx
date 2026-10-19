import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, BarChart3, Copy, Eye, GitBranch, GripVertical, History, ListTree, Lock, Plus, Rocket, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FormRecord } from '@/types';
import type { FormSchema, FormSection, Question, QuestionType } from '@/engines/forms';
import { allQuestions, completion, defaultAnswers, diffForms, validateAnswers } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PermissionGate } from '@/components/shared/Gates';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { FormRenderer } from '@/components/forms/FormFields';
import { qLabel } from '@/components/forms/QuestionInput';
import { defaultMobileUser, openMobileWindow } from '@/app/mobile';
import { isDraftDirty, latestVersion, materialize, publishForm, restoreVersion, setFormStatus } from '@/services/formService';
import { cn, uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useFormStore } from '@/stores/formStore';
import { ActorContext, useActor, useCan, useFormat, useLang, useT } from '@/stores/hooks';
import { NotFound } from '@/app/guards';
import { STATUS_TONE } from './FormsPage';
import { PALETTE, TYPE_ICON, newQuestion } from './builder/palette';
import { QuestionInspector, SectionInspector } from './builder/Inspector';
import { logicSummary } from './builder/LogicEditor';
import { FormSettings } from './FormSettings';

type Sel = { sid: string; qid?: string };

/** Forms builder (PRD G1): palette, canvas with drag to reorder, settings panel, preview, versions, publish. */
export function FormBuilderPage() {
  const { formId } = useParams();
  const form = useFormStore((s) => s.forms.find((f) => f.id === formId));
  const { orgId } = useActor();
  if (!form || form.orgId !== orgId) return <NotFound />;
  return <Builder key={form.id} form={form} />;
}

function Builder({ form }: { form: FormRecord }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const navigate = useNavigate();
  const can = useCan();
  const editable = can('forms.edit');
  const allLists = useFormStore((s) => s.optionLists);
  const lists = useMemo(() => allLists.filter((l) => l.orgId === orgId), [allLists, orgId]);
  const responses = useFormStore((s) => s.responses);
  const responseCount = useMemo(() => responses.filter((r) => r.formId === form.id).length, [responses, form.id]);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const sections = form.draft.sections;
  const [sel, setSel] = useState<Sel | null>(sections[0]?.questions[0] ? { sid: sections[0].id, qid: sections[0].questions[0].id } : sections[0] ? { sid: sections[0].id } : null);
  const [dialog, setDialog] = useState<'publish' | 'history' | 'preview' | null>(null);
  const [dragType, setDragType] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useDemoNotes([{ id: 'builder', key: 'demo.note.builder' }]);

  const latest = latestVersion(form);
  const dirty = isDraftDirty(form);
  const locked = useMemo(() => new Set(form.versions.flatMap((v) => allQuestions(v.schema).map((q) => q.id))), [form.versions]);
  const taken = useMemo(() => new Set(allQuestions(form.draft).map((q) => q.id)), [form.draft]);
  const profile = form.binding !== 'survey';
  const setSections = (next: FormSection[]) => useFormStore.getState().updateForm(form.id, { draft: { ...form.draft, sections: next } });
  const flat = sections.flatMap((s) => s.questions.map((q) => ({ s, q })));
  const earlierOf = (qid: string) => { const i = flat.findIndex((x) => x.q.id === qid); return flat.slice(0, Math.max(0, i)).map((x) => x.q).filter((q) => q.type !== 'note'); };

  const addQuestion = (type: QuestionType, at?: { sid: string; index?: number }) => {
    const target = at ?? (sel ? { sid: sel.sid, index: sel.qid ? sections.find((s) => s.id === sel.sid)!.questions.findIndex((q) => q.id === sel.qid) + 1 : undefined } : { sid: sections[0]!.id });
    const q = newQuestion(type, taken, { en: t(`forms.type.${type}`, { lng: 'en' }), fr: t(`forms.type.${type}`, { lng: 'fr' }) }, profile);
    setSections(sections.map((s) => (s.id === target.sid ? { ...s, questions: [...s.questions.slice(0, target.index ?? s.questions.length), q, ...s.questions.slice(target.index ?? s.questions.length)] } : s)));
    setSel({ sid: target.sid, qid: q.id });
  };
  const updateQuestion = (sid: string, qid: string, q: Question) => {
    setSections(sections.map((s) => (s.id === sid ? { ...s, questions: s.questions.map((x) => (x.id === qid ? q : x)) } : s)));
    if (q.id !== qid) setSel({ sid, qid: q.id });
  };
  const removeQuestion = (sid: string, qid: string) => { setSections(sections.map((s) => (s.id === sid ? { ...s, questions: s.questions.filter((x) => x.id !== qid) } : s))); setSel({ sid }); };
  const duplicate = (sid: string, q: Question) => {
    const copy = structuredClone(q);
    let id = `${q.id}Copy`;
    for (let n = 2; taken.has(id); n++) id = `${q.id}Copy${n}`;
    copy.id = id; if (copy.mapsTo?.startsWith('customFields.')) copy.mapsTo = `customFields.${id}`;
    setSections(sections.map((s) => (s.id === sid ? { ...s, questions: s.questions.flatMap((x) => (x.id === q.id ? [x, copy] : [x])) } : s)));
    setSel({ sid, qid: id });
  };
  const addSection = () => {
    const s: FormSection = { id: uid('sec'), title: { en: t('forms.newSection', { lng: 'en', n: sections.length + 1 }), fr: t('forms.newSection', { lng: 'fr', n: sections.length + 1 }) }, questions: [] };
    setSections([...sections, s]);
    setSel({ sid: s.id });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragType(null);
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const [overSid, overQid] = over.startsWith('sec:') ? [over.slice(4), undefined] : over.split('|');
    const targetSection = sections.find((s) => s.id === overSid);
    if (!targetSection) return;
    const overIndex = overQid ? targetSection.questions.findIndex((q) => q.id === overQid) : targetSection.questions.length;
    if (active.startsWith('new:')) return addQuestion(active.slice(4) as QuestionType, { sid: overSid!, index: overIndex });
    const [fromSid, qid] = active.split('|');
    if (fromSid === overSid && qid === overQid) return;
    const q = sections.find((s) => s.id === fromSid)!.questions.find((x) => x.id === qid)!;
    const removed = sections.map((s) => (s.id === fromSid ? { ...s, questions: s.questions.filter((x) => x.id !== qid) } : s));
    setSections(removed.map((s) => {
      if (s.id !== overSid) return s;
      let idx = overQid ? s.questions.findIndex((x) => x.id === overQid) : s.questions.length;
      const fromIdx = sections.find((x) => x.id === fromSid)!.questions.findIndex((x) => x.id === qid);
      if (fromSid === overSid && overQid && fromIdx < overIndex) idx += 1;
      return { ...s, questions: [...s.questions.slice(0, idx), q, ...s.questions.slice(idx)] };
    }));
    setSel({ sid: overSid!, qid });
  };

  const selSection = sel ? sections.find((s) => s.id === sel.sid) : undefined;
  const selQuestion = sel?.qid ? selSection?.questions.find((q) => q.id === sel.qid) : undefined;
  const mobileUser = defaultMobileUser(orgId, userId, memberships, roles);

  return (
    <div className="-mx-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/app/forms" className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowLeft className="h-3.5 w-3.5" /> {t('nav.forms')}</Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[26px] font-semibold text-ink">{form.name}</h1>
            <Badge tone={STATUS_TONE[form.status]}>{t(`forms.status.${form.status}`)}</Badge>
            {latest && <Badge tone="neutral">{t('forms.liveVersion', { n: latest.version })}</Badge>}
            {dirty && latest && <Badge tone="warningOutline">{t('forms.unpublished')}</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{t(`forms.bindingName.${form.binding}`)} · {t('forms.questionsCount', { count: taken.size })} · {t('forms.savedAuto')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog('preview')}><Eye /> {t('forms.previewWeb')}</Button>
          <Button variant="secondary" disabled={!mobileUser} onClick={() => mobileUser && openMobileWindow(orgId, mobileUser, undefined, `/m/preview/${form.id}`)}><Smartphone /> {t('forms.previewMobile')}</Button>
          <Button variant="secondary" onClick={() => setDialog('history')}><History /> {t('forms.history')}</Button>
          <Button variant="secondary" onClick={() => navigate(`/app/forms/${form.id}/responses`)}><BarChart3 /> {t('forms.responsesN', { count: responseCount })}</Button>
          <PermissionGate permission="forms.publish"><Button onClick={() => setDialog('publish')} disabled={!dirty}><Rocket /> {t('forms.publish')}</Button></PermissionGate>
        </div>
      </div>

      <Tabs defaultValue="build">
        <TabsList className="mb-4">
          <TabsTrigger value="build">{t('forms.tab.build')}</TabsTrigger>
          <TabsTrigger value="settings">{t('forms.tab.settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="build">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setDragType(String(e.active.id))} onDragCancel={() => setDragType(null)} onDragEnd={onDragEnd}>
            <fieldset disabled={!editable} className="grid min-w-0 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_360px] lg:grid-cols-[200px_minmax(0,1fr)]">
              <aside className="h-fit rounded-card border border-line bg-surface p-3 shadow-soft lg:sticky lg:top-20" aria-label={t('forms.palette')}>
                <p className="mb-2 px-1 text-[12px] text-muted">{t('forms.paletteHint')}</p>
                {PALETTE.map((g) => (
                  <div key={g.key} className="mb-3">
                    <div className="eyebrow mb-1 px-1">{t(`forms.group.${g.key}`)}</div>
                    <div className="grid grid-cols-1 gap-0.5">{g.types.map((ty) => <PaletteItem key={ty} type={ty} onAdd={() => addQuestion(ty)} />)}</div>
                  </div>
                ))}
              </aside>

              <div className="min-w-0 space-y-4">
                {sections.map((s, si) => (
                  <SectionCard key={s.id} section={s} index={si} selected={sel?.sid === s.id && !sel.qid} onSelect={() => setSel({ sid: s.id })}>
                    <SortableContext items={s.questions.map((q) => `${s.id}|${q.id}`)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-1.5">
                        {s.questions.map((q) => (
                          <QuestionRow key={q.id} sid={s.id} q={q} selected={sel?.qid === q.id} locked={locked.has(q.id)} onSelect={() => setSel({ sid: s.id, qid: q.id })} onDuplicate={() => duplicate(s.id, q)} onDelete={() => removeQuestion(s.id, q.id)}
                            logic={[logicSummary(q.showIf, flat.map((x) => x.q), t, lang) && t('forms.badge.showIf', { text: logicSummary(q.showIf, flat.map((x) => x.q), t, lang) }), q.jump && t('forms.badge.jump', { to: q.jump.to === 'END' ? t('forms.ins.endForm') : sections.find((x) => x.id === q.jump!.to)?.title[lang] ?? q.jump.to })].filter(Boolean) as string[]}
                            listName={q.optionListId ? lists.find((l) => l.id === q.optionListId)?.name[lang] : undefined} />
                        ))}
                      </ul>
                    </SortableContext>
                    {!s.questions.length && <p className="rounded-ctl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">{t('forms.emptySection')}</p>}
                  </SectionCard>
                ))}
                <Button variant="secondary" onClick={addSection}><Plus /> {t('forms.addSection')}</Button>
              </div>

              <aside className="h-fit rounded-card border border-line bg-surface p-4 shadow-soft lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:max-h-[calc(100vh-110px)] xl:overflow-y-auto" aria-label={t('forms.settingsPanel')}>
                {selQuestion && selSection ? (
                  <QuestionInspector key={selQuestion.id} q={selQuestion} onChange={(q) => updateQuestion(selSection.id, selQuestion.id, q)} earlier={earlierOf(selQuestion.id)} sections={sections.filter((_, i) => i > sections.indexOf(selSection))} binding={form.binding} lists={lists} locked={locked.has(selQuestion.id)} onDelete={() => removeQuestion(selSection.id, selQuestion.id)} />
                ) : selSection ? (
                  <SectionInspector s={selSection} onChange={(s) => setSections(sections.map((x) => (x.id === s.id ? s : x)))} earlier={flat.filter((x) => sections.indexOf(x.s) < sections.indexOf(selSection)).map((x) => x.q)} canDelete={sections.length > 1} onDelete={() => { setSections(sections.filter((x) => x.id !== selSection.id)); setSel(null); }} />
                ) : <p className="text-[14px] text-muted">{t('forms.selectSomething')}</p>}
              </aside>
            </fieldset>
            <DragOverlay>{dragType?.startsWith('new:') ? <div className="rounded-ctl border border-brand bg-surface px-3 py-2 text-[14px] shadow-lift">{t(`forms.type.${dragType.slice(4)}`)}</div> : null}</DragOverlay>
          </DndContext>
          {!editable && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted"><Lock className="h-3.5 w-3.5" /> {t('forms.readOnly')}</p>}
        </TabsContent>
        <TabsContent value="settings"><FormSettings form={form} /></TabsContent>
      </Tabs>

      {dialog === 'preview' && <PreviewDialog schema={materialize(form.draft, lists)} onClose={() => setDialog(null)} />}
      {dialog === 'publish' && <PublishDialog form={form} onClose={() => setDialog(null)} onPublished={(v) => toast.success(t('forms.published', { n: v }))} />}
      <Sheet open={dialog === 'history'} onOpenChange={(o) => !o && setDialog(null)}>
        <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
          <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t('forms.history')}</SheetTitle></div>
          <ol className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {[...form.versions].reverse().map((v, i, arr) => {
              const prev = arr[i + 1];
              const d = diffForms(prev?.schema, v.schema);
              return (
                <li key={v.version} className="rounded-ctl border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{t('set.forms.v', { n: v.version })}{v.version === latest?.version && <Badge tone="success" className="ml-2">{t('forms.current')}</Badge>}</span>
                    <span className="text-[12px] text-muted">{f.dateTime(v.publishedAt)}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-body">{v.note || '—'}</p>
                  <p className="mt-1 text-[12px] text-muted">{t('forms.diff', { added: d.added.length, removed: d.removed.length, changed: d.changed.length, total: allQuestions(v.schema).length })}</p>
                  {d.added.length > 0 && <p className="mt-1 text-[12px] text-success">{'+ '}{d.added.slice(0, 6).map((q) => qLabel(q, lang)).join(', ')}</p>}
                  {v.version !== latest?.version && editable && <Button size="xs" variant="secondary" className="mt-2" onClick={() => { restoreVersion(form.id, v.version, userId ?? 'system'); toast.success(t('forms.restored', { n: v.version })); setDialog(null); }}><GitBranch /> {t('forms.restore')}</Button>}
                </li>
              );
            })}
            {!form.versions.length && <p className="text-[14px] text-muted">{t('forms.noVersions')}</p>}
          </ol>
        </SheetContent>
      </Sheet>
      {form.status === 'LIVE' && can('forms.publish') && <div className="mt-6 text-right"><Button variant="ghost" size="sm" onClick={() => { setFormStatus(form.id, 'CLOSED', userId ?? 'system'); toast(t('forms.closed')); }}><ListTree /> {t('forms.closeForm')}</Button></div>}
    </div>
  );
}

function PaletteItem({ type, onAdd }: { type: QuestionType; onAdd: () => void }) {
  const { t } = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}` });
  const Icon = TYPE_ICON[type];
  return (
    <button ref={setNodeRef} type="button" {...attributes} {...listeners} onClick={onAdd} className={cn('flex items-center gap-2 rounded-ctl px-2 py-1.5 text-left text-[13px] text-body hover:bg-brand-soft hover:text-brand', isDragging && 'opacity-40')}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {t(`forms.type.${type}`)}
    </button>
  );
}

function SectionCard({ section, index, selected, onSelect, children }: { section: FormSection; index: number; selected: boolean; onSelect: () => void; children: ReactNode }) {
  const { t } = useT();
  const lang = useLang();
  const { setNodeRef, isOver } = useDroppable({ id: `sec:${section.id}` });
  return (
    <section ref={setNodeRef} className={cn('rounded-card border bg-surface p-4 shadow-soft transition-colors', selected ? 'border-brand' : 'border-line', isOver && 'border-brand/60 bg-brand-soft/30')}>
      <button type="button" onClick={onSelect} className="mb-3 flex w-full items-center gap-2 text-left">
        <span className="tnum flex h-6 w-6 items-center justify-center rounded-full bg-canvas text-[12px] font-semibold text-muted">{index + 1}</span>
        <span className="flex-1 text-[16px] font-semibold text-ink">{section.title[lang] ?? section.title.en}</span>
        {section.showIf?.conditions.length ? <Badge tone="info">{t('forms.ins.hasLogic')}</Badge> : null}
      </button>
      {children}
    </section>
  );
}

function QuestionRow({ sid, q, selected, locked, onSelect, onDuplicate, onDelete, logic, listName }: { sid: string; q: Question; selected: boolean; locked: boolean; onSelect: () => void; onDuplicate: () => void; onDelete: () => void; logic: string[]; listName?: string }) {
  const { t } = useT();
  const lang = useLang();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${sid}|${q.id}` });
  const Icon = TYPE_ICON[q.type];
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('group flex items-start gap-2 rounded-ctl border bg-surface px-2 py-2', selected ? 'border-brand ring-[3px] ring-brand-soft' : 'border-line hover:border-brand/40', isDragging && 'z-10 opacity-70 shadow-lift')}>
      <button type="button" {...attributes} {...listeners} className="mt-0.5 cursor-grab rounded p-1 text-muted hover:text-ink" aria-label={t('forms.drag', { label: qLabel(q, lang) })}><GripVertical className="h-4 w-4" /></button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{qLabel(q, lang) || <span className="text-muted">{t('forms.untitled')}</span>}{q.required && <span className="text-danger"> *</span>}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span className="font-mono">{q.id}</span>
            <span>{'·'} {t(`forms.type.${q.type}`)}</span>
            {listName && <Badge tone="info" className="h-5 text-[11px]">{listName}</Badge>}
            {q.sensitive && <Badge tone="warningOutline" className="h-5 text-[11px]">{t('forms.ins.sensitive')}</Badge>}
            {locked && <Lock className="h-3 w-3" aria-label={t('forms.ins.keyLocked')} />}
          </span>
          {logic.map((x) => <span key={x} className="mt-1 block truncate text-[12px] text-info">{x}</span>)}
        </span>
      </button>
      <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button type="button" variant="ghost" size="iconSm" onClick={onDuplicate} aria-label={t('forms.duplicate')}><Copy /></Button>
        <Button type="button" variant="ghost" size="iconSm" onClick={onDelete} aria-label={t('forms.deleteQuestion')}><Trash2 /></Button>
      </span>
    </li>
  );
}

function PreviewDialog({ schema, onClose }: { schema: FormSchema; onClose: () => void }) {
  const actor = useActor();
  const { t } = useT();
  const [lang, setLang] = useState(actor.lang);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => defaultAnswers(schema));
  const [checked, setChecked] = useState(false);
  const errors = validateAnswers(schema, answers);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('forms.previewTitle', { name: schema.name })}</DialogTitle>
          <DialogDescription>{t('forms.previewHint')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1">{(['en', 'fr'] as const).map((l) => <Button key={l} size="xs" variant={lang === l ? 'primary' : 'secondary'} onClick={() => setLang(l)}>{l.toUpperCase()}</Button>)}</div>
          <span className="tnum text-[13px] text-muted">{t('forms.complete', { pct: completion(schema, answers) })}</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <ActorContext.Provider value={{ ...actor, lang }}>
            <FormRenderer form={schema} answers={answers} onChange={setAnswers} errors={checked ? errors : []} />
          </ActorContext.Provider>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { setAnswers(defaultAnswers(schema)); setChecked(false); }}>{t('forms.reset')}</Button>
          <Button onClick={() => { setChecked(true); if (!errors.length) toast.success(t('forms.previewValid')); }}>{t('forms.checkAnswers')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishDialog({ form, onClose, onPublished }: { form: FormRecord; onClose: () => void; onPublished: (v: number) => void }) {
  const { userId } = useActor();
  const { t } = useT();
  const lang = useLang();
  const [note, setNote] = useState('');
  const latest = latestVersion(form);
  const d = diffForms(latest?.schema, { ...form.draft, name: form.name });
  const empty = !allQuestions(form.draft).length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('forms.publishTitle', { n: (latest?.version ?? 0) + 1 })}</DialogTitle>
          <DialogDescription>{t('forms.publishHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-[14px]">
          {[['added', d.added, 'text-success'], ['changed', d.changed, 'text-info'], ['removed', d.removed, 'text-danger']].map(([k, list, cls]) => (list as Question[]).length ? (
            <div key={k as string}><div className={cn('font-semibold', cls as string)}>{t(`forms.diff_${k as string}`, { count: (list as Question[]).length })}</div><div className="text-[13px] text-body">{(list as Question[]).map((q) => qLabel(q, lang)).join(', ')}</div></div>
          ) : null)}
          {d.removed.length > 0 && <p className="rounded-ctl bg-warning/10 px-3 py-2 text-[13px] text-ink">{t('forms.removedNote')}</p>}
          {form.binding !== 'survey' && <p className="rounded-ctl bg-info/5 px-3 py-2 text-[13px] text-ink">{t('forms.profileNote')}</p>}
          <Input compact value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('forms.notePlaceholder')} aria-label={t('forms.note')} />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={empty} onClick={() => { const r = publishForm(form.id, userId ?? 'system', note || undefined); onPublished(r.version); onClose(); }}><Rocket /> {t('forms.publishNow')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
