import { Plus, Trash2 } from 'lucide-react';
import type { Condition, LogicGroup, Operator, Question } from '@/engines/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { optLabel, qLabel } from '@/components/forms/QuestionInput';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/stores/hooks';

const sel = 'h-9 rounded-ctl border border-line bg-surface px-2 text-[13px] text-ink';

/** Operators that make sense for a question type. */
export function operatorsFor(q?: Question): Operator[] {
  if (!q) return ['isNotEmpty', 'isEmpty'];
  if (q.type === 'yesNo') return ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'];
  if (q.type === 'selectOne') return ['equals', 'notEquals', 'inList', 'isEmpty', 'isNotEmpty'];
  if (q.type === 'selectMany') return ['anySelected', 'allSelected', 'contains', 'isEmpty', 'isNotEmpty'];
  if (['number', 'decimal', 'currency', 'rating', 'likert', 'nps', 'year', 'calculated'].includes(q.type)) return ['equals', 'notEquals', 'gt', 'lt', 'between', 'isEmpty', 'isNotEmpty'];
  if (['shortText', 'longText', 'email', 'phone'].includes(q.type)) return ['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty'];
  return ['isEmpty', 'isNotEmpty'];
}

const isGroup = (c: Condition | LogicGroup): c is LogicGroup => 'combinator' in c;

function ValueInput({ q, c, onChange }: { q?: Question; c: Condition; onChange: (v: unknown) => void }) {
  const { t } = useT();
  const lang = useLang();
  if (c.op === 'isEmpty' || c.op === 'isNotEmpty') return null;
  if (q?.type === 'yesNo') {
    return <select className={sel} value={String(c.value ?? true)} onChange={(e) => onChange(e.target.value === 'true')} aria-label={t('forms.logic.value')}><option value="true">{t('common.yes')}</option><option value="false">{t('common.no')}</option></select>;
  }
  if (q?.options?.length) {
    const multi = c.op === 'inList' || c.op === 'anySelected' || c.op === 'allSelected';
    if (multi) {
      const list = Array.isArray(c.value) ? (c.value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {q.options.map((o) => <button key={o.value} type="button" onClick={() => onChange(list.includes(o.value) ? list.filter((x) => x !== o.value) : [...list, o.value])} className={cn('rounded-full border px-2 py-0.5 text-[12px]', list.includes(o.value) ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted')}>{optLabel(o, lang)}</button>)}
        </div>
      );
    }
    return <select className={sel} value={String(c.value ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={t('forms.logic.value')}><option value="">{t('form.choose')}</option>{q.options.map((o) => <option key={o.value} value={o.value}>{optLabel(o, lang)}</option>)}</select>;
  }
  if (c.op === 'between') {
    const [lo, hi] = Array.isArray(c.value) ? (c.value as number[]) : [0, 10];
    return <span className="flex items-center gap-1"><Input compact type="number" className="h-9 w-20" value={lo} onChange={(e) => onChange([Number(e.target.value), hi])} aria-label={t('set.commodities.min')} /><span className="text-muted">{'–'}</span><Input compact type="number" className="h-9 w-20" value={hi} onChange={(e) => onChange([lo, Number(e.target.value)])} aria-label={t('set.commodities.max')} /></span>;
  }
  const numeric = q && ['number', 'decimal', 'currency', 'rating', 'likert', 'nps', 'year', 'calculated'].includes(q.type);
  return <Input compact type={numeric ? 'number' : 'text'} className="h-9 w-32" value={c.value == null ? '' : String(c.value)} onChange={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)} aria-label={t('forms.logic.value')} />;
}

/** Show-if / required-if / jump logic: AND/OR groups of conditions on earlier questions (PRD G1). */
export function LogicEditor({ value, onChange, questions, depth = 0 }: { value?: LogicGroup; onChange: (g: LogicGroup | undefined) => void; questions: Question[]; depth?: number }) {
  const { t } = useT();
  const lang = useLang();
  const g = value ?? { combinator: 'AND' as const, conditions: [] };
  const set = (conditions: (Condition | LogicGroup)[]) => onChange(conditions.length || depth > 0 ? { ...g, conditions } : undefined);
  const first = questions[0];
  const blank = (): Condition => ({ questionId: first?.id ?? '', op: operatorsFor(first)[0]!, value: first?.type === 'yesNo' ? true : undefined });
  if (!questions.length) return <p className="text-[12px] text-muted">{t('forms.logic.noEarlier')}</p>;
  return (
    <div className={cn('space-y-2', depth > 0 && 'rounded-ctl border border-dashed border-line p-2')}>
      {g.conditions.length > 1 && (
        <div className="flex items-center gap-1 text-[12px]">
          {(['AND', 'OR'] as const).map((c) => <button key={c} type="button" onClick={() => onChange({ ...g, combinator: c })} className={cn('rounded-full px-2.5 py-0.5 font-semibold', g.combinator === c ? 'bg-brand text-on-brand' : 'bg-canvas text-muted')}>{t(`forms.logic.${c}`)}</button>)}
        </div>
      )}
      {g.conditions.map((c, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            {isGroup(c) ? (
              <LogicEditor value={c} depth={depth + 1} questions={questions} onChange={(ng) => set(ng && ng.conditions.length ? g.conditions.map((x, j) => (j === i ? ng : x)) : g.conditions.filter((_, j) => j !== i))} />
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <select className={cn(sel, 'max-w-[180px]')} value={c.questionId} onChange={(e) => { const q = questions.find((x) => x.id === e.target.value); set(g.conditions.map((x, j) => (j === i ? { questionId: e.target.value, op: operatorsFor(q)[0]!, value: q?.type === 'yesNo' ? true : undefined } : x))); }} aria-label={t('forms.logic.question')}>
                  {questions.map((q) => <option key={q.id} value={q.id}>{qLabel(q, lang) || q.id}</option>)}
                </select>
                <select className={sel} value={c.op} onChange={(e) => set(g.conditions.map((x, j) => (j === i ? { ...(x as Condition), op: e.target.value as Operator } : x)))} aria-label={t('forms.logic.operator')}>
                  {operatorsFor(questions.find((q) => q.id === c.questionId)).map((op) => <option key={op} value={op}>{t(`forms.op.${op}`)}</option>)}
                </select>
                <ValueInput q={questions.find((q) => q.id === c.questionId)} c={c} onChange={(v) => set(g.conditions.map((x, j) => (j === i ? { ...(x as Condition), value: v } : x)))} />
              </div>
            )}
          </div>
          <Button type="button" variant="ghost" size="iconSm" onClick={() => set(g.conditions.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="xs" onClick={() => set([...g.conditions, blank()])}><Plus /> {t('forms.logic.add')}</Button>
        {depth === 0 && g.conditions.length > 0 && <Button type="button" variant="ghost" size="xs" onClick={() => set([...g.conditions, { combinator: g.combinator === 'AND' ? 'OR' : 'AND', conditions: [blank()] }])}><Plus /> {t('forms.logic.addGroup')}</Button>}
      </div>
    </div>
  );
}

/** Logic in words for the canvas badges. */
export function logicSummary(g: LogicGroup | undefined, questions: Question[], t: (k: string, o?: Record<string, unknown>) => string, lang: 'en' | 'fr'): string {
  if (!g?.conditions.length) return '';
  return g.conditions.map((c) => {
    if (isGroup(c)) return `(${logicSummary(c, questions, t, lang)})`;
    const q = questions.find((x) => x.id === c.questionId);
    const v = Array.isArray(c.value) ? c.value.map((x) => (q?.options?.find((o) => o.value === x) ? optLabel(q.options.find((o) => o.value === x)!, lang) : String(x))).join(', ')
      : typeof c.value === 'boolean' ? t(c.value ? 'common.yes' : 'common.no')
      : q?.options?.find((o) => o.value === c.value) ? optLabel(q.options.find((o) => o.value === c.value)!, lang) : c.value == null ? '' : String(c.value);
    return `${q ? qLabel(q, lang) : c.questionId} ${t(`forms.op.${c.op}`).toLocaleLowerCase()} ${v}`.trim();
  }).join(` ${t(`forms.logic.${g.combinator}`).toLocaleLowerCase()} `);
}
