import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Lock, Plus, Trash2 } from 'lucide-react';
import type { OptionList } from '@/types';
import type { FormBinding, FormSection, Option, Question } from '@/engines/forms';
import { CHOICE_TYPES, PROFILE_BINDINGS, evaluateFormula, questionKey } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { optLabel } from '@/components/forms/QuestionInput';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/stores/hooks';
import { LogicEditor } from './LogicEditor';

type L = Partial<Record<'en' | 'fr', string>>;
const sel = 'h-10 w-full rounded-ctl border border-line bg-surface px-2 text-[14px] text-ink';

const CORE_FIELDS: Partial<Record<FormBinding, string[]>> = {
  farmerProfile: ['firstName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'primaryCrop'],
  communityProfile: ['name', 'population', 'contactPerson.name', 'contactPerson.phone'],
  groupProfile: ['name', 'established'],
};

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

function Group({ title, children, open: initial = true, badge }: { title: string; children: ReactNode; open?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="border-t border-line py-3 first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-[13px] font-semibold text-ink">
        <span className="flex-1">{title}</span>{badge}
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

function LangPair({ label, value, onChange, multiline }: { label: string; value?: L; onChange: (v: L) => void; multiline?: boolean }) {
  const v = value ?? {};
  return (
    <div className="space-y-1.5">
      <span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{label}</span>
      {(['en', 'fr'] as const).map((lang) => (
        <div key={lang} className="flex items-start gap-2">
          <span className="mt-2.5 w-6 text-[11px] font-semibold uppercase text-muted">{lang}</span>
          {multiline
            ? <textarea value={v[lang] ?? ''} onChange={(e) => onChange({ ...v, [lang]: e.target.value })} rows={2} aria-label={`${label} (${lang})`} className="w-full rounded-ctl border border-line bg-surface p-2 text-[14px] text-ink" />
            : <Input compact value={v[lang] ?? ''} onChange={(e) => onChange({ ...v, [lang]: e.target.value })} aria-label={`${label} (${lang})`} className="h-10" />}
        </div>
      ))}
    </div>
  );
}

function OptionsEditor({ options, onChange, label }: { options: Option[]; onChange: (o: Option[]) => void; label: string }) {
  const { t } = useT();
  const taken = new Set(options.map((o) => o.value));
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input compact className="h-9 flex-1" value={o.label.en ?? ''} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: { ...x.label, en: e.target.value } } : x)))} aria-label={`${label} ${i + 1} (en)`} placeholder="EN" />
          <Input compact className="h-9 flex-1" value={o.label.fr ?? ''} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: { ...x.label, fr: e.target.value } } : x)))} aria-label={`${label} ${i + 1} (fr)`} placeholder="FR" />
          <Button variant="ghost" size="iconSm" disabled={i === 0} onClick={() => { const a = [...options]; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; onChange(a); }} aria-label={t('form.moveUp')}><ArrowUp /></Button>
          <Button variant="ghost" size="iconSm" disabled={i === options.length - 1} onClick={() => { const a = [...options]; [a[i + 1], a[i]] = [a[i]!, a[i + 1]!]; onChange(a); }} aria-label={t('form.moveDown')}><ArrowDown /></Button>
          <Button variant="ghost" size="iconSm" onClick={() => onChange(options.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={() => { const n = options.length + 1; onChange([...options, { value: questionKey(`option ${n}`, taken), label: { en: `Option ${n}`, fr: `Option ${n}` } }]); }}><Plus /> {t('forms.addOption')}</Button>
    </div>
  );
}

/** Right-hand settings for the selected question (PRD G1 question settings). */
export function QuestionInspector({ q, onChange, earlier, sections, binding, lists, locked, onDelete }: {
  q: Question; onChange: (q: Question) => void; earlier: Question[]; sections: FormSection[]; binding: FormBinding; lists: OptionList[]; locked: boolean; onDelete: () => void;
}) {
  const { t } = useT();
  const lang = useLang();
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const numeric = ['number', 'decimal', 'currency', 'year'].includes(q.type);
  const texty = ['shortText', 'longText', 'email', 'phone'].includes(q.type);
  const datey = ['date', 'dateTime', 'monthYear'].includes(q.type);
  const choice = CHOICE_TYPES.includes(q.type);
  const scale = ['rating', 'likert', 'nps'].includes(q.type);
  const profile = PROFILE_BINDINGS.includes(binding);
  const formulaCheck = q.type === 'calculated' && q.formula ? evaluateFormula(q.formula, Object.fromEntries(earlier.map((x) => [x.id, 2]))) : null;
  const list = lists.find((l) => l.id === q.optionListId);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone="brand">{t(`forms.type.${q.type}`)}</Badge>
        <Button variant="ghost" size="xs" onClick={onDelete}><Trash2 /> {t('forms.deleteQuestion')}</Button>
      </div>
      <Group title={t('forms.ins.basics')}>
        <LangPair label={t('forms.ins.label')} value={q.label} onChange={(label) => set({ label })} multiline={q.type === 'note'} />
        {q.type !== 'note' && <LangPair label={t('forms.ins.help')} value={q.help} onChange={(help) => set({ help })} />}
        <Row label={t('forms.ins.key')} hint={locked ? <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> {t('forms.ins.keyLocked')}</span> : t('forms.ins.keyHint')}>
          <Input compact className="h-10 font-mono" value={q.id} disabled={locked} onChange={(e) => { const id = e.target.value.replace(/[^A-Za-z0-9_]/g, ''); set({ id, mapsTo: q.mapsTo?.startsWith('customFields.') ? `customFields.${id}` : q.mapsTo }); }} aria-label={t('forms.ins.key')} />
        </Row>
        {!['note', 'calculated', 'autoId'].includes(q.type) && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-ink">{t('forms.ins.required')}</span>
            <Switch checked={!!q.required} onCheckedChange={(required) => set({ required })} aria-label={t('forms.ins.required')} />
          </div>
        )}
        {(texty || numeric) && <LangPair label={t('forms.ins.placeholder')} value={q.placeholder} onChange={(placeholder) => set({ placeholder })} />}
        {(texty || numeric || q.type === 'yesNo' || q.type === 'selectOne' || datey) && (
          <Row label={t('forms.ins.default')}>
            {q.type === 'yesNo' ? (
              <select className={sel} value={q.default == null ? '' : String(q.default)} onChange={(e) => set({ default: e.target.value === '' ? undefined : e.target.value === 'true' })} aria-label={t('forms.ins.default')}><option value="">{'—'}</option><option value="true">{t('common.yes')}</option><option value="false">{t('common.no')}</option></select>
            ) : q.type === 'selectOne' ? (
              <select className={sel} value={String(q.default ?? '')} onChange={(e) => set({ default: e.target.value || undefined })} aria-label={t('forms.ins.default')}><option value="">{'—'}</option>{q.options?.map((o) => <option key={o.value} value={o.value}>{optLabel(o, lang)}</option>)}</select>
            ) : (
              <Input compact className="h-10" type={numeric ? 'number' : datey ? 'date' : 'text'} value={q.default == null ? '' : String(q.default)} onChange={(e) => set({ default: e.target.value === '' ? undefined : numeric ? Number(e.target.value) : e.target.value })} aria-label={t('forms.ins.default')} />
            )}
          </Row>
        )}
      </Group>

      {choice && (
        <Group title={t('forms.ins.options')} badge={list && <Badge tone="info">{list.name[lang] ?? list.name.en}</Badge>}>
          <Row label={t('forms.ins.source')}>
            <select className={sel} value={q.optionListId ?? ''} onChange={(e) => { const l = lists.find((x) => x.id === e.target.value); set({ optionListId: l?.id, options: l ? l.options : q.options }); }} aria-label={t('forms.ins.source')}>
              <option value="">{t('forms.ins.inline')}</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{t('forms.ins.sharedList', { name: l.name[lang] ?? l.name.en })}</option>)}
            </select>
          </Row>
          {list ? <p className="text-[13px] text-muted">{list.options.map((o) => optLabel(o, lang)).join(' · ')}</p> : <OptionsEditor options={q.options ?? []} onChange={(options) => set({ options })} label={t('forms.ins.option')} />}
          {q.type !== 'ranking' && <div className="flex items-center justify-between"><span className="text-[14px] text-ink">{t('forms.ins.other')}</span><Switch checked={!!q.other} onCheckedChange={(other) => set({ other })} aria-label={t('forms.ins.other')} /></div>}
          <div className="flex items-center justify-between"><span className="text-[14px] text-ink">{t('forms.ins.randomise')}</span><Switch checked={!!q.randomise} onCheckedChange={(randomise) => set({ randomise })} aria-label={t('forms.ins.randomise')} /></div>
        </Group>
      )}

      {scale && (
        <Group title={t('forms.ins.scale')}>
          {q.type !== 'nps' && <Row label={t('forms.ins.points')}><Input compact type="number" min={q.type === 'likert' ? 3 : 2} max={10} className="h-10" value={q.scale?.max ?? 5} onChange={(e) => set({ scale: { ...q.scale, max: Math.max(q.type === 'likert' ? 3 : 2, Math.min(10, Number(e.target.value) || 5)), labels: undefined } })} aria-label={t('forms.ins.points')} /></Row>}
          {q.type === 'rating' && <Row label={t('forms.ins.style')}><select className={sel} value={q.scale?.style ?? 'stars'} onChange={(e) => set({ scale: { ...q.scale, style: e.target.value as 'stars' } })} aria-label={t('forms.ins.style')}>{(['stars', 'numbers', 'checks'] as const).map((s) => <option key={s} value={s}>{t(`forms.style.${s}`)}</option>)}</select></Row>}
          {q.type !== 'rating' && <><LangPair label={t('forms.ins.low')} value={q.scale?.low} onChange={(low) => set({ scale: { ...q.scale, low } })} /><LangPair label={t('forms.ins.high')} value={q.scale?.high} onChange={(high) => set({ scale: { ...q.scale, high } })} /></>}
        </Group>
      )}

      {(numeric || texty || datey) && (
        <Group title={t('forms.ins.validation')} open={false}>
          {numeric && <div className="grid grid-cols-2 gap-2"><Row label={t('set.commodities.min')}><Input compact type="number" className="h-10" value={q.validation?.min ?? ''} onChange={(e) => set({ validation: { ...q.validation, min: e.target.value === '' ? undefined : Number(e.target.value) } })} aria-label={t('set.commodities.min')} /></Row><Row label={t('set.commodities.max')}><Input compact type="number" className="h-10" value={q.validation?.max ?? ''} onChange={(e) => set({ validation: { ...q.validation, max: e.target.value === '' ? undefined : Number(e.target.value) } })} aria-label={t('set.commodities.max')} /></Row></div>}
          {texty && <><div className="grid grid-cols-2 gap-2"><Row label={t('forms.ins.minLength')}><Input compact type="number" className="h-10" value={q.validation?.minLength ?? ''} onChange={(e) => set({ validation: { ...q.validation, minLength: e.target.value === '' ? undefined : Number(e.target.value) } })} aria-label={t('forms.ins.minLength')} /></Row><Row label={t('forms.ins.maxLength')}><Input compact type="number" className="h-10" value={q.validation?.maxLength ?? ''} onChange={(e) => set({ validation: { ...q.validation, maxLength: e.target.value === '' ? undefined : Number(e.target.value) } })} aria-label={t('forms.ins.maxLength')} /></Row></div>
            <Row label={t('forms.ins.regex')} hint={t('forms.ins.regexHint')}><Input compact className="h-10 font-mono" value={q.validation?.regex ?? ''} onChange={(e) => set({ validation: { ...q.validation, regex: e.target.value || undefined } })} aria-label={t('forms.ins.regex')} /></Row></>}
          {datey && <div className="grid grid-cols-2 gap-2"><Row label={t('forms.ins.from')}><Input compact type="date" className="h-10" value={q.validation?.minDate ?? ''} onChange={(e) => set({ validation: { ...q.validation, minDate: e.target.value || undefined } })} aria-label={t('forms.ins.from')} /></Row><Row label={t('forms.ins.to')}><Input compact type="date" className="h-10" value={q.validation?.maxDate ?? ''} onChange={(e) => set({ validation: { ...q.validation, maxDate: e.target.value || undefined } })} aria-label={t('forms.ins.to')} /></Row></div>}
        </Group>
      )}

      {q.type === 'calculated' && (
        <Group title={t('forms.ins.formula')}>
          <Row label={t('forms.ins.formula')} hint={q.formula ? (formulaCheck == null ? <span className="text-danger">{t('forms.ins.formulaBad')}</span> : t('forms.ins.formulaOk', { value: formulaCheck })) : t('forms.ins.formulaHint')}>
            <Input compact className="h-10 font-mono" value={q.formula ?? ''} onChange={(e) => set({ formula: e.target.value })} aria-label={t('forms.ins.formula')} placeholder="members - childrenCount" />
          </Row>
          <div className="flex flex-wrap gap-1">{earlier.filter((x) => ['number', 'decimal', 'currency', 'rating', 'likert', 'nps', 'calculated'].includes(x.type)).map((x) => <button key={x.id} type="button" onClick={() => set({ formula: `${q.formula ?? ''}${q.formula ? ' ' : ''}${x.id}` })} className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-body hover:border-brand">{x.id}</button>)}</div>
        </Group>
      )}

      {['image', 'video', 'file'].includes(q.type) && (
        <Group title={t('forms.ins.media')}>
          <div className="grid grid-cols-2 gap-2">
            <Row label={t('forms.ins.maxFiles')}><Input compact type="number" min={1} max={10} className="h-10" value={q.media?.max ?? 1} onChange={(e) => set({ media: { ...q.media, max: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } })} aria-label={t('forms.ins.maxFiles')} /></Row>
            <Row label={t('forms.ins.maxMb')}><Input compact type="number" min={1} className="h-10" value={q.media?.maxMb ?? 10} onChange={(e) => set({ media: { ...q.media, maxMb: Number(e.target.value) || 10 } })} aria-label={t('forms.ins.maxMb')} /></Row>
          </div>
        </Group>
      )}
      {q.type === 'recordPicker' && <Group title={t('forms.ins.record')}><select className={sel} value={q.recordType ?? 'farmer'} onChange={(e) => set({ recordType: e.target.value as Question['recordType'] })} aria-label={t('forms.ins.record')}>{(['farmer', 'community', 'group', 'plot', 'bag'] as const).map((r) => <option key={r} value={r}>{t(`form.recordType.${r}`)}</option>)}</select></Group>}
      {q.type === 'table' && (
        <Group title={t('forms.ins.table')}>
          <span className="block text-[12px] font-semibold uppercase text-label">{t('forms.ins.rows')}</span>
          <OptionsEditor options={q.rows ?? []} onChange={(rows) => set({ rows })} label={t('forms.ins.rows')} />
          <span className="block text-[12px] font-semibold uppercase text-label">{t('forms.ins.columns')}</span>
          <OptionsEditor options={q.columns ?? []} onChange={(columns) => set({ columns })} label={t('forms.ins.columns')} />
        </Group>
      )}
      {q.type === 'repeatGroup' && (
        <Group title={t('forms.ins.repeat')}>
          {(q.children ?? []).map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input compact className="h-9 flex-1" value={c.label.en ?? ''} onChange={(e) => set({ children: q.children!.map((x, j) => (j === i ? { ...x, label: { ...x.label, en: e.target.value } } : x)) })} aria-label={`${t('forms.ins.label')} ${i + 1}`} />
              <select className="h-9 rounded-ctl border border-line bg-surface px-1 text-[13px]" value={c.type} onChange={(e) => set({ children: q.children!.map((x, j) => (j === i ? { ...x, type: e.target.value as Question['type'] } : x)) })} aria-label={t('forms.ins.type')}>
                {(['shortText', 'number', 'decimal', 'date', 'yesNo'] as const).map((ty) => <option key={ty} value={ty}>{t(`forms.type.${ty}`)}</option>)}
              </select>
              <Button variant="ghost" size="iconSm" onClick={() => set({ children: q.children!.filter((_, j) => j !== i) })} aria-label={t('set.remove')}><Trash2 /></Button>
            </div>
          ))}
          <Button variant="ghost" size="xs" onClick={() => set({ children: [...(q.children ?? []), { id: questionKey('field', new Set((q.children ?? []).map((x) => x.id))), type: 'shortText', label: { en: 'Field', fr: 'Champ' } }] })}><Plus /> {t('forms.ins.addField')}</Button>
        </Group>
      )}

      <Group title={t('forms.ins.logic')} open={!!(q.showIf || q.requiredIf || q.jump)} badge={(q.showIf || q.jump) && <Badge tone="info">{t('forms.ins.hasLogic')}</Badge>}>
        <div><span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('forms.ins.showIf')}</span><LogicEditor value={q.showIf} onChange={(showIf) => set({ showIf })} questions={earlier} /></div>
        {!['note', 'calculated'].includes(q.type) && <div><span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('forms.ins.requiredIf')}</span><LogicEditor value={q.requiredIf} onChange={(requiredIf) => set({ requiredIf })} questions={[...earlier, q]} /></div>}
        <div>
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('forms.ins.jump')}</span>
          <LogicEditor value={q.jump?.when} onChange={(when) => set({ jump: when ? { when, to: q.jump?.to ?? 'END' } : undefined })} questions={[...earlier, q]} />
          {q.jump && (
            <select className={cn(sel, 'mt-2')} value={q.jump.to} onChange={(e) => set({ jump: { ...q.jump!, to: e.target.value } })} aria-label={t('forms.ins.jumpTo')}>
              {sections.map((s) => <option key={s.id} value={s.id}>{t('forms.ins.goTo', { section: s.title[lang] ?? s.title.en ?? s.id })}</option>)}
              <option value="END">{t('forms.ins.endForm')}</option>
            </select>
          )}
        </div>
      </Group>

      <Group title={t('forms.ins.data')} open={profile}>
        {profile && !['note', 'calculated', 'autoId'].includes(q.type) && (
          <Row label={t('forms.ins.mapsTo')} hint={t('forms.ins.mapsToHint')}>
            <select className={sel} value={q.mapsTo ?? ''} onChange={(e) => set({ mapsTo: e.target.value || undefined })} aria-label={t('forms.ins.mapsTo')}>
              <option value="">{t('forms.ins.notMapped')}</option>
              <option value={`customFields.${q.id}`}>{t('forms.ins.customField', { key: q.id })}</option>
              {(CORE_FIELDS[binding] ?? []).map((f) => <option key={f} value={f}>{t('forms.ins.coreField', { field: f })}</option>)}
            </select>
          </Row>
        )}
        <div className="flex items-center justify-between gap-3">
          <span><span className="block text-[14px] text-ink">{t('forms.ins.sensitive')}</span><span className="block text-[12px] text-muted">{t('forms.ins.sensitiveHint')}</span></span>
          <Switch checked={!!q.sensitive} onCheckedChange={(sensitive) => set({ sensitive })} aria-label={t('forms.ins.sensitive')} />
        </div>
      </Group>
    </div>
  );
}

export function SectionInspector({ s, onChange, earlier, onDelete, canDelete }: { s: FormSection; onChange: (s: FormSection) => void; earlier: Question[]; onDelete: () => void; canDelete: boolean }) {
  const { t } = useT();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between"><Badge tone="neutral">{t('forms.section')}</Badge>{canDelete && <Button variant="ghost" size="xs" onClick={onDelete}><Trash2 /> {t('forms.deleteSection')}</Button>}</div>
      <Group title={t('forms.ins.basics')}><LangPair label={t('forms.ins.title')} value={s.title} onChange={(title) => onChange({ ...s, title })} /></Group>
      <Group title={t('forms.ins.sectionLogic')}><LogicEditor value={s.showIf} onChange={(showIf) => onChange({ ...s, showIf })} questions={earlier} /></Group>
    </div>
  );
}
