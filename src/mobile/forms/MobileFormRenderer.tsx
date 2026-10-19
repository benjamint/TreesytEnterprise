import { useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FormSchema, ValidationError } from '@/engines/forms';
import { formFlow, isRequired, validateAnswers, withCalculated } from '@/engines/forms';
import { Button } from '@/components/ui/button';
import { QuestionInput, qLabel } from '@/components/forms/QuestionInput';
import { errorText } from '@/components/forms/FormFields';
import { useLang, useT } from '@/stores/hooks';

type Answers = Record<string, unknown>;

/**
 * `<MobileFormRenderer>` (PRD 8.3, 10): the same engine as the web renderer, one section per
 * step with a progress bar, 48 px targets and a sticky action button. Jumps and end-form rules
 * change the step count as the agent answers.
 */
export function MobileFormRenderer({ form, answers, onChange, onFinish, finishLabel, onSaveDraft, before, after }: {
  form: FormSchema; answers: Answers; onChange: (a: Answers) => void; onFinish: () => void; finishLabel: string; onSaveDraft?: () => void;
  /** Extra steps before / after the form's own sections (core fields, review). */
  before?: { title: string; content: ReactNode; valid: boolean }[];
  after?: { title: string; content: ReactNode; valid: boolean }[];
}) {
  const lang = useLang();
  const { t } = useT();
  const flow = formFlow(form, answers);
  const steps = [
    ...(before ?? []).map((s) => ({ kind: 'extra' as const, ...s })),
    ...flow.map((f) => ({ kind: 'section' as const, title: f.section.title[lang] ?? f.section.title.en ?? '', flow: f })),
    ...(after ?? []).map((s) => ({ kind: 'extra' as const, ...s })),
  ];
  const [i, setI] = useState(0);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const step = steps[Math.min(i, steps.length - 1)]!;
  const last = i >= steps.length - 1;
  const set = (id: string, v: unknown) => onChange(withCalculated(form, { ...answers, [id]: v }));

  const next = () => {
    if (step.kind === 'section') {
      const ids = new Set(step.flow.questions.map((q) => q.id));
      const errs = validateAnswers(form, answers).filter((e) => ids.has(e.questionId));
      setErrors(errs);
      if (errs.length) return;
    } else if (!step.valid) return;
    if (last) onFinish();
    else { setI(i + 1); setErrors([]); document.getElementById('mform-top')?.scrollIntoView(); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-3 pt-1">
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink">{step.title}</span>
          <span className="tnum text-muted">{t('mobile.form.step', { n: Math.min(i, steps.length - 1) + 1, total: steps.length })}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((Math.min(i, steps.length - 1) + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div id="mform-top" />
        {step.kind === 'extra' ? step.content : (
          <div className="space-y-6">
            {step.flow.questions.map((q) => {
              const err = errors.find((e) => e.questionId === q.id);
              if (q.type === 'note') return <p key={q.id} className="rounded-ctl bg-info/10 px-4 py-3 text-[15px] text-ink">{qLabel(q, lang)}</p>;
              return (
                <div key={q.id}>
                  <div className="mb-2 text-[16px] font-medium leading-snug text-ink">{qLabel(q, lang)}{isRequired(q, answers) && <span className="text-danger"> *</span>}</div>
                  {(q.help?.[lang] ?? q.help?.en) && <p className="-mt-1 mb-2 text-[13px] text-muted">{q.help?.[lang] ?? q.help?.en}</p>}
                  <QuestionInput q={q} value={answers[q.id]} answers={answers} big onChange={(v) => set(q.id, v)} invalid={!!err} otherText={answers[`${q.id}__other`] as string | undefined} onOtherText={(v) => set(`${q.id}__other`, v)} />
                  {err && <p className="mt-1.5 text-[13px] text-danger" role="alert">{errorText(t, q, err.code)}</p>}
                </div>
              );
            })}
            {!step.flow.questions.length && <p className="text-[15px] text-muted">{t('mobile.form.nothingHere')}</p>}
          </div>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t border-line p-4">
        <div className="flex gap-2">
          {i > 0 && <Button size="lg" variant="secondary" onClick={() => { setI(i - 1); setErrors([]); }} aria-label={t('mobile.back')}><ArrowLeft /></Button>}
          <Button size="lg" className="flex-1" onClick={next} disabled={step.kind === 'extra' && !step.valid}>{last ? finishLabel : t('mobile.form.next')}</Button>
        </div>
        {onSaveDraft && <Button variant="ghost" className="w-full" onClick={onSaveDraft}>{t('mobile.form.saveDraft')}</Button>}
      </div>
    </div>
  );
}
