import { Badge } from '@/components/ui/badge';
import { qLabel } from '@/components/forms/QuestionInput';
import { allQuestions } from '@/engines/forms';
import { useLiveForm } from '@/services/formService';
import { useLang, useT } from '@/stores/hooks';

const CORE = ['farmerId', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'community', 'agent', 'registeredAt', 'score', 'qualityStatus'];

/** Fields the report builder (phase 17) offers for farmers: core fields plus the live profile form. */
export function ReportFieldsPreview() {
  const { t, terms } = useT();
  const lang = useLang();
  const form = useLiveForm('farmerProfile');
  const qs = allQuestions(form).filter((q) => !['note', 'repeatGroup', 'table'].includes(q.type));
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <h2 className="text-[16px] font-semibold text-ink">{t('reportFields.title', { farmers: terms.farmers })}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{t('reportFields.hint', { name: form.name, n: form.version })}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {CORE.map((k) => <Badge key={k} tone="neutral">{t(`reportFields.core.${k}`)}</Badge>)}
        {qs.map((q) => <Badge key={q.id} tone="brand">{qLabel(q, lang)}</Badge>)}
      </div>
    </section>
  );
}
