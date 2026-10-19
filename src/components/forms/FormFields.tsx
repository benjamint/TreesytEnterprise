import { Plus, Trash2 } from 'lucide-react';
import type { FormSchema, Question, ValidationError } from '@/engines/forms';
import { evaluateLogic } from '@/engines/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/shared/Field';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/stores/hooks';

type Answers = Record<string, unknown>;

const label = (q: Pick<Question, 'label'>, lang: 'en' | 'fr') => q.label[lang] ?? q.label.en ?? '';

/**
 * Web form renderer for profile forms (Phase 5 subset; the full renderer with every question
 * type arrives with the forms builder in phase 6). Visibility follows the form's show-if logic.
 */
export function FormFields({ form, answers, onChange, errors = [], columns = 2 }: { form: FormSchema; answers: Answers; onChange: (a: Answers) => void; errors?: ValidationError[]; columns?: 1 | 2 }) {
  const lang = useLang();
  const { t } = useT();
  return (
    <div className="space-y-6">
      {form.sections.filter((s) => evaluateLogic(s.showIf, answers)).map((s) => (
        <div key={s.id} className={cn('grid gap-4', columns === 2 && 'sm:grid-cols-2')}>
          {s.questions.filter((q) => evaluateLogic(q.showIf, answers)).map((q) => {
            const err = errors.find((e) => e.questionId === q.id);
            return (
              <div key={q.id} className={cn(q.type === 'repeatGroup' || q.type === 'selectMany' || q.type === 'longText' ? 'sm:col-span-2' : undefined)}>
                <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">
                  {label(q, lang)}{q.required && <span className="text-danger"> *</span>}
                </span>
                <QuestionInput q={q} value={answers[q.id]} onChange={(v) => onChange({ ...answers, [q.id]: v })} invalid={!!err} />
                {err && <p className="mt-1 text-[12px] text-danger" role="alert">{t(`form.error.${err.code}`, { min: q.validation?.min, max: q.validation?.max })}</p>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function QuestionInput({ q, value, onChange, invalid }: { q: Question; value: unknown; onChange: (v: unknown) => void; invalid?: boolean }) {
  const lang = useLang();
  const { t } = useT();
  const cls = cn(invalid && 'border-danger');
  const aria = label(q, lang);
  switch (q.type) {
    case 'number':
    case 'decimal':
    case 'currency':
      return <Input compact type="number" step={q.type === 'number' ? 1 : 'any'} value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={cn('tnum', cls)} aria-label={aria} aria-invalid={invalid} />;
    case 'date':
      return <Input compact type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} className={cls} aria-label={aria} />;
    case 'longText':
      return <textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={3} aria-label={aria} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" />;
    case 'yesNo':
      return (
        <div className="flex h-11 items-center gap-1 rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={aria}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn('h-full flex-1 rounded-[8px] text-[13px] font-medium', value === v ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>
              {t(v ? 'common.yes' : 'common.no')}
            </button>
          ))}
        </div>
      );
    case 'selectOne':
      return (
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} aria-label={aria} className={cn('h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft', cls)}>
          <option value="">{t('form.choose')}</option>
          {q.options?.map((o) => <option key={o.value} value={o.value}>{o.label[lang] ?? o.label.en}</option>)}
        </select>
      );
    case 'selectMany': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-ctl border border-line p-3">
          {q.options?.map((o) => <Checkbox key={o.value} label={o.label[lang] ?? o.label.en} checked={list.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))} />)}
        </div>
      );
    }
    case 'repeatGroup': {
      const rows = Array.isArray(value) ? (value as Answers[]) : [];
      return (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-ctl border border-line p-2">
              {q.children?.map((c) => (
                <div key={c.id} className="min-w-[120px] flex-1">
                  <QuestionInput q={c} value={row[c.id]} onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.id]: v } : r)))} />
                </div>
              ))}
              <Button variant="ghost" size="iconSm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => onChange([...rows, {}])}><Plus /> {t('form.addRow', { what: aria.toLocaleLowerCase(lang) })}</Button>
        </div>
      );
    }
    default:
      return <Input compact type={q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : 'text'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={cls} aria-label={aria} aria-invalid={invalid} />;
  }
}

/** Answers as label → value, for profile tabs. */
export function AnswersView({ form, answers }: { form: FormSchema; answers: Answers }) {
  const lang = useLang();
  const { t } = useT();
  const display = (q: Question, v: unknown): string => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
    if (q.type === 'yesNo') return t(v ? 'common.yes' : 'common.no');
    const optLabel = (x: unknown) => { const o = q.options?.find((op) => op.value === x); return o ? o.label[lang] ?? o.label.en ?? String(x) : String(x); };
    if (q.type === 'selectOne') return optLabel(v);
    if (q.type === 'selectMany') return (v as unknown[]).map(optLabel).join(', ');
    if (q.type === 'repeatGroup') return t('form.rows', { count: (v as unknown[]).length });
    return String(v);
  };
  const shown = form.sections.flatMap((s) => s.questions).filter((q) => evaluateLogic(q.showIf, answers));
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map((q) => (
        <div key={q.id} className="min-w-0">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{label(q, lang)}</dt>
          <dd className="mt-0.5 text-[14px] text-ink">{display(q, answers[q.id])}</dd>
        </div>
      ))}
    </dl>
  );
}
