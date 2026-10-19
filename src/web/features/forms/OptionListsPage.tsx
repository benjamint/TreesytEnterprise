import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { OptionList } from '@/types';
import { allQuestions, questionKey } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { TabEmpty } from '@/components/shared/ListKit';
import { makeEvent } from '@/engines/activity';
import { cn, uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useFormStore } from '@/stores/formStore';
import { useActor, useCan, useFormat, useLang, useOrgRows, useT } from '@/stores/hooks';

/** Shared option lists (PRD G1): crops, ID types, education levels… used across forms. */
export function OptionListsPage() {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const can = useCan();
  const lists = useOrgRows(useFormStore((s) => s.optionLists));
  const forms = useOrgRows(useFormStore((s) => s.forms));
  const sorted = useMemo(() => [...lists].sort((a, b) => (a.name[lang] ?? a.name.en ?? '').localeCompare(b.name[lang] ?? b.name.en ?? '')), [lists, lang]);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const selected = lists.find((l) => l.id === selectedId);
  const [draft, setDraft] = useState<OptionList | null>(selected ?? null);
  const usage = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const fm of forms) for (const schema of [fm.draft, ...fm.versions.map((v) => v.schema)]) for (const q of allQuestions(schema)) if (q.optionListId) m.set(q.optionListId, (m.get(q.optionListId) ?? new Set()).add(fm.name));
    return m;
  }, [forms]);
  const pick = (l: OptionList) => { setSelectedId(l.id); setDraft(structuredClone(l)); };
  const dirty = draft && selected && JSON.stringify(draft) !== JSON.stringify(selected);
  const isNew = draft && !selected;
  const save = () => {
    if (!draft) return;
    const next = { ...draft, updatedAt: new Date().toISOString() };
    useFormStore.getState().saveOptionList(next);
    useActivityStore.getState().log(makeEvent(orgId, 'optionList', next.id, 'optionList.saved', { name: next.name[lang] ?? next.name.en, count: next.options.length }, userId ?? 'system'));
    setSelectedId(next.id);
    toast.success(t('forms.lists.saved', { name: next.name[lang] ?? next.name.en }));
  };
  const edit = can('forms.edit');
  const opts = draft?.options ?? [];
  const setOpts = (options: OptionList['options']) => draft && setDraft({ ...draft, options });

  return (
    <>
      <Link to="/app/forms" className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowLeft className="h-3.5 w-3.5" /> {t('nav.forms')}</Link>
      <PageHeader eyebrow={t('nav.section.forms')} title={t('nav.optionLists')} description={t('pages.optionLists')}
        primary={<PermissionGate permission="forms.edit"><Button onClick={() => { setSelectedId(null); setDraft({ id: uid('ol'), orgId, name: { en: t('forms.lists.newName'), fr: t('forms.lists.newName') }, options: [], updatedAt: new Date().toISOString() }); }}><Plus /> {t('forms.lists.new')}</Button></PermissionGate>} />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <ul className="h-fit divide-y divide-line rounded-card border border-line bg-surface shadow-soft">
          {sorted.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => pick(l)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', l.id === selectedId ? 'bg-brand-soft' : 'hover:bg-canvas')}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{l.name[lang] ?? l.name.en}</span><span className="text-[12px] text-muted">{t('forms.lists.options', { count: l.options.length })}</span></span>
                {(usage.get(l.id)?.size ?? 0) > 0 && <Badge tone="neutral">{t('forms.lists.usedIn', { count: usage.get(l.id)!.size })}</Badge>}
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          {draft ? (
            <fieldset disabled={!edit} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {(['en', 'fr'] as const).map((l) => <label key={l} className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('forms.lists.name')} ({l.toUpperCase()})</span><Input compact value={draft.name[l] ?? ''} onChange={(e) => setDraft({ ...draft, name: { ...draft.name, [l]: e.target.value } })} aria-label={`${t('forms.lists.name')} ${l}`} /></label>)}
              </div>
              <div>
                <div className="mb-2 grid grid-cols-[140px_1fr_1fr_100px] gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-label"><span>{t('forms.lists.value')}</span><span>{'EN'}</span><span>{'FR'}</span><span /></div>
                <ul className="space-y-1.5">
                  {opts.map((o, i) => (
                    <li key={i} className="grid grid-cols-[140px_1fr_1fr_100px] items-center gap-2">
                      <Input compact className="h-9 font-mono text-[12px]" value={o.value} disabled={!!selected?.options.some((x) => x.value === o.value) && (usage.get(draft.id)?.size ?? 0) > 0} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, value: e.target.value.replace(/[^A-Za-z0-9_]/g, '') } : x)))} aria-label={`${t('forms.lists.value')} ${i + 1}`} />
                      <Input compact className="h-9" value={o.label.en ?? ''} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, label: { ...x.label, en: e.target.value } } : x)))} aria-label={`EN ${i + 1}`} />
                      <Input compact className="h-9" value={o.label.fr ?? ''} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, label: { ...x.label, fr: e.target.value } } : x)))} aria-label={`FR ${i + 1}`} />
                      <span className="flex">
                        <Button variant="ghost" size="iconSm" disabled={i === 0} onClick={() => { const a = [...opts]; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; setOpts(a); }} aria-label={t('form.moveUp')}><ArrowUp /></Button>
                        <Button variant="ghost" size="iconSm" disabled={i === opts.length - 1} onClick={() => { const a = [...opts]; [a[i + 1], a[i]] = [a[i]!, a[i + 1]!]; setOpts(a); }} aria-label={t('form.moveDown')}><ArrowDown /></Button>
                        <Button variant="ghost" size="iconSm" onClick={() => setOpts(opts.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button>
                      </span>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpts([...opts, { value: questionKey(`option ${opts.length + 1}`, new Set(opts.map((o) => o.value))), label: { en: '', fr: '' } }])}><Plus /> {t('forms.addOption')}</Button>
              </div>
              <div className="rounded-ctl bg-canvas px-4 py-3 text-[13px] text-body">
                {usage.get(draft.id)?.size ? t('forms.lists.usedBy', { forms: [...usage.get(draft.id)!].join(', ') }) : t('forms.lists.unused')}
                {selected && <span className="block text-[12px] text-muted">{t('forms.lists.updated', { date: f.dateTime(selected.updatedAt) })}</span>}
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" disabled={isNew || (usage.get(draft.id)?.size ?? 0) > 0} onClick={() => { useFormStore.getState().removeOptionList(draft.id); setDraft(null); setSelectedId(null); toast(t('forms.lists.deleted')); }}><Trash2 /> {t('forms.lists.delete')}</Button>
                <div className="flex gap-2">
                  {dirty && <Button variant="secondary" onClick={() => setDraft(structuredClone(selected!))}>{t('common.cancel')}</Button>}
                  <Button onClick={save} disabled={!isNew && !dirty || opts.some((o) => !o.value || !(o.label.en || o.label.fr))}>{t('common.save')}</Button>
                </div>
              </div>
            </fieldset>
          ) : <TabEmpty>{t('forms.lists.pick')}</TabEmpty>}
        </div>
      </div>
    </>
  );
}
