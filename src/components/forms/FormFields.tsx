import type { FormSchema, Question, ValidationError } from '@/engines/forms';
import { DISPLAY_TYPES, formFlow, isRequired, withCalculated } from '@/engines/forms';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/stores/hooks';
import { Photo } from './media';
import { OTHER, QuestionInput, optLabel, qLabel } from './QuestionInput';

type Answers = Record<string, unknown>;
type T = (key: string, opts?: Record<string, unknown>) => string;

const WIDE: Question['type'][] = ['repeatGroup', 'selectMany', 'longText', 'table', 'note', 'ranking', 'likert', 'nps', 'image', 'gpsPolygon', 'signature', 'contact', 'locationPicker', 'video', 'file'];

export function errorText(t: T, q: Question, code: string) {
  return t(`form.error.${code}`, { min: q.validation?.min, max: q.validation?.max, date: code === 'minDate' ? q.validation?.minDate : q.validation?.maxDate });
}

/**
 * `<FormRenderer>` (PRD 8.3): renders any form on the web with show-if, jump / end-form,
 * required-if, calculated fields and every question type. Mobile uses the same engine and
 * inputs in `<MobileFormRenderer>`.
 */
export function FormRenderer({ form, answers, onChange, errors = [], columns = 2, titles = true }: { form: FormSchema; answers: Answers; onChange: (a: Answers) => void; errors?: ValidationError[]; columns?: 1 | 2; titles?: boolean }) {
  const lang = useLang();
  const { t } = useT();
  const flow = formFlow(form, answers);
  const set = (id: string, v: unknown) => onChange(withCalculated(form, { ...answers, [id]: v }));
  const multi = flow.length > 1;
  return (
    <div className="space-y-6">
      {flow.map(({ section, questions }) => (
        <section key={section.id}>
          {titles && multi && <h4 className="mb-3 border-b border-line pb-2 text-[14px] font-semibold text-ink">{section.title[lang] ?? section.title.en}</h4>}
          <div className={cn('grid gap-4', columns === 2 && 'sm:grid-cols-2')}>
            {questions.map((q) => {
              const err = errors.find((e) => e.questionId === q.id);
              const help = q.help?.[lang] ?? q.help?.en;
              if (q.type === 'note') {
                return <p key={q.id} className="rounded-ctl border border-info/30 bg-info/5 px-4 py-3 text-[14px] text-ink sm:col-span-2">{qLabel(q, lang)}</p>;
              }
              return (
                <div key={q.id} className={cn('min-w-0', WIDE.includes(q.type) && 'sm:col-span-2')}>
                  <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">
                    {qLabel(q, lang)}{isRequired(q, answers) && <span className="text-danger"> *</span>}
                  </span>
                  {help && <span className="-mt-0.5 mb-1.5 block text-[12px] text-muted">{help}</span>}
                  <QuestionInput q={q} value={answers[q.id]} answers={answers} onChange={(v) => set(q.id, v)} invalid={!!err} otherText={answers[`${q.id}__other`] as string | undefined} onOtherText={(v) => set(`${q.id}__other`, v)} />
                  {err && <p className="mt-1 text-[12px] text-danger" role="alert">{errorText(t, q, err.code)}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Profile forms on the web use the same renderer. */
export const FormFields = FormRenderer;

const isBlank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** An answer as text, for answer views, exports and analytics. */
export function answerText(q: Question, v: unknown, t: T, lang: 'en' | 'fr', other?: unknown): string {
  if (isBlank(v)) return '—';
  const opt = (x: unknown) => (x === OTHER ? `${t('form.other')}: ${String(other ?? '')}` : (() => { const o = q.options?.find((op) => op.value === x); return o ? optLabel(o, lang) : String(x); })());
  switch (q.type) {
    case 'yesNo': return t(v ? 'common.yes' : 'common.no');
    case 'selectOne': return opt(v);
    case 'selectMany':
    case 'ranking': return (v as unknown[]).map(opt).join(q.type === 'ranking' ? ' › ' : ', ');
    case 'repeatGroup': return t('form.rows', { count: (v as unknown[]).length });
    case 'rating': case 'likert': return `${String(v)} / ${q.scale?.max ?? 5}`;
    case 'nps': return `${String(v)} / 10`;
    case 'currency': case 'number': case 'decimal': return Number.isFinite(Number(v)) ? Number(v).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB').replace(/[\u202f\u00a0]/g, ' ') : String(v);
    case 'gpsPoint': { const g = v as { lat: number; lng: number; accuracy: number }; return `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)} (±${g.accuracy} m)`; }
    case 'gpsPolygon': { const p = v as { points: unknown[]; areaHa: number }; return t('form.media.polygon', { n: p.points.length, ha: p.areaHa }); }
    case 'image': case 'video': case 'file': return t('form.files', { count: (v as unknown[]).length });
    case 'audio': return t('form.media.seconds', { s: (v as { seconds: number }).seconds });
    case 'signature': return t('form.media.signed');
    case 'thumbprint': return t('form.media.thumbQuality', { q: String(v).split(':')[1] ?? '' });
    case 'contact': { const c = v as { name?: string; phone?: string }; return [c.name, c.phone].filter(Boolean).join(' · ') || '—'; }
    case 'table': {
      const rows = v as Record<string, Record<string, unknown>>;
      return (q.rows ?? []).map((r) => `${optLabel(r, lang)}: ${(q.columns ?? []).map((c) => rows[r.value]?.[c.value] ?? '—').join(' / ')}`).join('; ');
    }
    default: return String(v);
  }
}

/** Answers as label → value (profile tabs, response detail). Photos and signatures show as images. */
export function AnswersView({ form, answers, masked = [] }: { form: FormSchema; answers: Answers; masked?: string[] }) {
  const lang = useLang();
  const { t } = useT();
  const shown = formFlow(form, answers).flatMap((s) => s.questions).filter((q) => q.type !== 'note');
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map((q) => {
        const v = answers[q.id];
        const wide = ['image', 'signature', 'table', 'repeatGroup'].includes(q.type) && !isBlank(v);
        return (
          <div key={q.id} className={cn('min-w-0', wide && 'sm:col-span-2')}>
            <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{qLabel(q, lang)}</dt>
            <dd className="mt-0.5 text-[14px] text-ink">
              {masked.includes(q.id) ? <span className="text-muted">{t('form.masked')}</span>
                : q.type === 'image' && Array.isArray(v) && v.length ? <div className="mt-1 flex flex-wrap gap-2">{(v as string[]).map((p, i) => <Photo key={i} src={p} className="h-20 w-28 rounded-ctl border border-line" />)}</div>
                : q.type === 'signature' && typeof v === 'string' && v.startsWith('data:') ? <img src={v} alt={t('form.media.signed')} className="mt-1 h-16 rounded-ctl border border-line bg-surface" />
                : q.type === 'repeatGroup' && Array.isArray(v) && v.length ? (
                  <ul className="mt-1 space-y-1 text-[13px]">{(v as Answers[]).map((row, i) => <li key={i} className="rounded-ctl bg-canvas px-3 py-1.5">{q.children?.map((c) => `${qLabel(c, lang)}: ${answerText(c, row[c.id], t, lang)}`).join(' · ')}</li>)}</ul>
                ) : <span className={cn(DISPLAY_TYPES.includes(q.type) && 'tnum font-semibold')}>{answerText(q, v, t, lang, answers[`${q.id}__other`])}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
