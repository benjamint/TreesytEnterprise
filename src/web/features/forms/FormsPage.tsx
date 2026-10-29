import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ListTree, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { FormRecord } from '@/types';
import { FORM_BINDINGS, type FormBinding, type FormSection } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { createForm, isDraftDirty, latestVersion } from '@/services/formService';
import { draftForm } from '@/services/formDraft';
import { cn } from '@/lib/utils';
import { useFormStore } from '@/stores/formStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { Field } from '@/web/features/people/CommunityForm';

export const STATUS_TONE = { DRAFT: 'neutral', TEST: 'info', LIVE: 'success', CLOSED: 'dark' } as const;
type View = 'all' | 'surveys' | 'profiles' | 'live' | 'drafts';

/** Forms & surveys list (PRD G1). */
export function FormsPage() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const lk = useLookups();
  const forms = useOrgRows(useFormStore((s) => s.forms));
  const responses = useOrgRows(useFormStore((s) => s.responses));
  const [q, setQ] = useState('');
  const [binding, setBinding] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<View>('all');
  const [creating, setCreating] = useState(false);
  useDemoNotes([{ id: 'forms', key: 'demo.note.forms' }]);

  const rows = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of responses) count.set(r.formId, (count.get(r.formId) ?? 0) + 1);
    return forms.map((x) => ({ ...x, responses: count.get(x.id) ?? 0, version: latestVersion(x)?.version ?? 0, dirty: isDraftDirty(x) && x.versions.length > 0 }));
  }, [forms, responses]);
  type Row = (typeof rows)[number];
  const inView = (r: Row, v: View) => v === 'all' || (v === 'surveys' && r.binding === 'survey') || (v === 'profiles' && r.binding !== 'survey') || (v === 'live' && r.status === 'LIVE') || (v === 'drafts' && (r.status === 'DRAFT' || r.dirty));
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => inView(r, view) && (!query || r.name.toLowerCase().includes(query)) && (!binding || r.binding === binding) && (!status || r.status === status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorKey: 'name', cell: (c) => <div className="min-w-0"><div className="font-medium text-ink">{c.row.original.name}</div>{c.row.original.description && <div className="max-w-md truncate text-[12px] text-muted">{c.row.original.description}</div>}</div> },
    { id: 'binding', header: t('forms.binding'), accessorKey: 'binding', cell: (c) => t(`forms.bindingName.${c.getValue() as string}`) },
    { id: 'version', header: t('set.forms.version'), accessorKey: 'version', cell: (c) => <span className="flex items-center gap-1.5">{c.row.original.version ? t('set.forms.v', { n: c.row.original.version }) : '—'}{c.row.original.dirty && <Badge tone="warningOutline">{t('forms.unpublished')}</Badge>}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <Badge tone={STATUS_TONE[c.getValue() as FormRecord['status']]}>{t(`forms.status.${c.getValue() as string}`)}</Badge> },
    { id: 'responses', header: t('forms.responses'), accessorKey: 'responses', cell: (c) => <span className="tnum">{f.number(c.getValue() as number)}</span> },
    { id: 'owner', header: t('forms.owner'), accessorFn: (r) => lk.user(r.ownerId) },
    { id: 'updated', header: t('forms.updated'), accessorKey: 'updatedAt', cell: (c) => f.date(c.getValue() as string) },
  ], [t, f, lk]);

  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.forms')}
        title={t('nav.forms')}
        description={t('pages.forms')}
        actions={<Button variant="secondary" onClick={() => navigate('/app/forms/option-lists')}><ListTree /> {t('nav.optionLists')}</Button>}
        primary={<PermissionGate permission="forms.create"><Button onClick={() => setCreating(true)}><Plus /> {t('forms.new')}</Button></PermissionGate>}
      />
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder={t('forms.search')}
        views={(['all', 'surveys', 'profiles', 'live', 'drafts'] as const).map((v) => ({ key: v, label: t(`forms.view.${v}`), active: view === v, onSelect: () => setView(v), count: rows.filter((r) => inView(r, v)).length }))}
        filters={[
          { key: 'binding', label: t('forms.binding'), value: binding, onChange: setBinding, options: FORM_BINDINGS.filter((b) => rows.some((r) => r.binding === b)).map((b) => ({ value: b, label: t(`forms.bindingName.${b}`) })) },
          { key: 'status', label: t('col.status'), value: status, onChange: setStatus, options: (['DRAFT', 'TEST', 'LIVE', 'CLOSED'] as const).map((s) => ({ value: s, label: t(`forms.status.${s}`) })) },
        ]}
        onClear={() => { setQ(''); setBinding(''); setStatus(''); setView('all'); }}
      />
      <DataTable columns={columns} data={shown} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/app/forms/${r.id}`)} empty={t('people.noMatch')} />
      {creating && <NewFormDialog forms={forms} onClose={() => setCreating(false)} />}
    </>
  );
}

function NewFormDialog({ forms, onClose }: { forms: FormRecord[]; onClose: () => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [binding, setBinding] = useState<FormBinding>('survey');
  const [subject, setSubject] = useState<'' | 'farmer' | 'community' | 'farmerGroup'>('farmer');
  const [start, setStart] = useState<'blank' | 'ai' | 'copy'>('blank');
  const [description, setDescription] = useState('');
  const [copyId, setCopyId] = useState(forms[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const sel = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';

  const create = async () => {
    if (!name.trim()) return;
    let sections: FormSection[] = [{ id: 's1', title: { en: 'Section 1', fr: 'Section 1' }, questions: [] }];
    if (start === 'ai') {
      setBusy(true);
      const d = await draftForm(description || name);
      setBusy(false);
      sections = d.sections;
      toast.success(t('forms.drafted', { count: d.sections.reduce((s, x) => s + x.questions.length, 0), sections: d.sections.length }));
    } else if (start === 'copy') {
      const src = forms.find((x) => x.id === copyId);
      if (src) sections = structuredClone(src.draft.sections);
    }
    const f = createForm(orgId, name.trim(), binding, sections, userId ?? 'system', { subject: binding === 'survey' && subject ? subject : undefined, description: start === 'ai' ? description : undefined });
    onClose();
    navigate(`/app/forms/${f.id}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('forms.new')}</DialogTitle>
          <DialogDescription>{t('forms.newHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t('col.name')}><Input compact autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={t('col.name')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('forms.binding')}>
              <select className={sel} value={binding} onChange={(e) => setBinding(e.target.value as FormBinding)} aria-label={t('forms.binding')}>
                {FORM_BINDINGS.map((b) => <option key={b} value={b}>{t(`forms.bindingName.${b}`)}</option>)}
              </select>
            </Field>
            {binding === 'survey' && (
              <Field label={t('forms.subject')}>
                <select className={sel} value={subject} onChange={(e) => setSubject(e.target.value as typeof subject)} aria-label={t('forms.subject')}>
                  <option value="">{t('forms.noSubject')}</option>
                  {(['farmer', 'community', 'farmerGroup'] as const).map((s) => <option key={s} value={s}>{t(`set.dq.entityName.${s}`)}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('forms.startFrom')}>
            {(['blank', 'ai', 'copy'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={start === s} onClick={() => setStart(s)} className={cn('rounded-ctl border p-3 text-left text-[13px]', start === s ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40')}>
                <span className="flex items-center gap-1.5 font-medium text-ink">{s === 'ai' && <Sparkles className="h-4 w-4 text-brand" />}{t(`forms.start.${s}`)}</span>
                <span className="mt-0.5 block text-muted">{t(`forms.startHint.${s}`)}</span>
              </button>
            ))}
          </div>
          {start === 'ai' && (
            <Field label={t('forms.describe')}>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t('forms.describePlaceholder')} aria-label={t('forms.describe')} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none" />
            </Field>
          )}
          {start === 'copy' && (
            <Field label={t('forms.copyFrom')}>
              <select className={sel} value={copyId} onChange={(e) => setCopyId(e.target.value)} aria-label={t('forms.copyFrom')}>{forms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void create()} disabled={!name.trim() || busy}>{busy ? t('forms.drafting') : t('forms.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
