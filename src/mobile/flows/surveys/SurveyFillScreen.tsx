import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, MessageSquareWarning, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { FormRecord, SurveyResponse } from '@/types';
import { defaultAnswers } from '@/engines/forms';
import { Input } from '@/components/ui/input';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { MobileFormRenderer } from '@/mobile/forms/MobileFormRenderer';
import { fillSchema, latestVersion, materialize, submitResponse } from '@/services/formService';
import { cn, uid } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormStore } from '@/stores/formStore';
import { useGroupStore } from '@/stores/groupStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useActor, useOrgRows, useT } from '@/stores/hooks';

type Answers = Record<string, unknown>;
const draftKey = (userId: string, formId: string) => `treesyt-demo:v1:surveyDraft:${userId}:${formId}`;
function readDraft(key: string): { answers: Answers; subject?: SurveyResponse['subject'] } | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeDraft(key: string, v: unknown) { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

/** Records the agent can survey: those in their communities. */
function useSubjects(entity: FormRecord['subject']) {
  const { agent } = useMobileAgent();
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  return useMemo(() => {
    const mineIds = new Set(communities.filter((c) => agent && c.agentIds.includes(agent.id)).map((c) => c.id));
    const inScope = (cid: string) => !mineIds.size || mineIds.has(cid);
    if (entity === 'farmer') return farmers.filter((f) => inScope(f.communityId)).map((f) => ({ id: f.id, label: `${f.firstName} ${f.lastName}`, detail: f.farmerCode }));
    if (entity === 'community') return communities.filter((c) => inScope(c.id)).map((c) => ({ id: c.id, label: c.name, detail: c.code }));
    if (entity === 'farmerGroup') return groups.filter((g) => inScope(g.communityId)).map((g) => ({ id: g.id, label: g.name, detail: communities.find((c) => c.id === g.communityId)?.name ?? '' }));
    return [];
  }, [entity, agent, communities, farmers, groups]);
}

function SubjectPicker({ entity, value, onChange }: { entity: NonNullable<FormRecord['subject']>; value?: string; onChange: (id: string) => void }) {
  const { t } = useT();
  const items = useSubjects(entity);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const shown = (ql ? items.filter((x) => `${x.label} ${x.detail}`.toLowerCase().includes(ql)) : items).slice(0, 30);
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-body">{t('mobile.surveys.pickSubject', { what: t(`set.dq.entityName.${entity}`).toLocaleLowerCase() })}</p>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mobile.surveys.search')} aria-label={t('mobile.surveys.search')} className="h-12 pl-9 text-[16px]" /></div>
      <ul className="divide-y divide-line rounded-card border border-line">
        {shown.map((x) => (
          <li key={x.id}>
            <button type="button" onClick={() => onChange(x.id)} className={cn('flex min-h-[56px] w-full items-center gap-3 px-4 text-left', value === x.id && 'bg-brand-soft')}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{x.label}</span><span className="block font-mono text-[12px] text-muted">{x.detail}</span></span>
              {value === x.id && <CheckCircle2 className="h-5 w-5 text-brand" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useBaseGps() {
  const { agent } = useMobileAgent();
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const c = communities.find((x) => agent && x.agentIds.includes(agent.id)) ?? communities[0];
  return c?.gps ?? { lat: 9.4, lng: -0.85 };
}

/** M10 fill a survey: pick the subject if the form is about a record → the form → submit (or save on the phone when offline). */
export function SurveyFillScreen() {
  const { formId } = useParams();
  const form = useFormStore((s) => s.forms.find((f) => f.id === formId));
  const { orgId } = useActor();
  if (!form || form.orgId !== orgId) return <Missing />;
  return <Fill key={form.id} form={form} />;
}

function Missing() {
  const { t } = useT();
  return <div className="flex min-h-0 flex-1 flex-col"><MobileHeader title={t('mobile.surveys.title')} back /><p className="px-6 py-10 text-center text-[15px] text-muted">{t('mobile.surveys.missing')}</p></div>;
}

function Fill({ form }: { form: FormRecord }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { userId } = useActor();
  const { agent } = useMobileAgent();
  const online = useMobileSessionStore((s) => s.online);
  const lists = useFormStore((s) => s.optionLists);
  const schema = useMemo(() => fillSchema(form, lists), [form, lists]);
  const key = draftKey(userId ?? '', form.id);
  const saved = useMemo(() => readDraft(key), [key]);
  const [answers, setAnswers] = useState<Answers>(saved?.answers ?? defaultAnswers(schema));
  const [subject, setSubject] = useState<string | undefined>(saved?.subject?.id);
  const [startedAt] = useState(new Date().toISOString());
  const base = useBaseGps();
  const sub = form.subject && subject ? { entity: form.subject, id: subject } : undefined;

  const finish = () => {
    const gps = { lat: base.lat + (Math.random() - 0.5) * 0.02, lng: base.lng + (Math.random() - 0.5) * 0.02, accuracy: 4 + Math.round(Math.random() * 8) };
    if (!online) {
      useOutboxStore.getState().add({ id: uid('ob'), orgId: form.orgId, userId: userId ?? '', type: 'survey', label: t('mobile.surveys.outboxLabel', { name: form.name }), payload: { formId: form.id, answers, subject: sub, gps, startedAt, agentId: agent?.id }, createdAt: new Date().toISOString() });
      writeDraft(key, null);
      toast.success(t('mobile.surveys.savedOffline'));
      navigate('/m/surveys');
      return;
    }
    const r = submitResponse({ form, schema, answers, userId: userId ?? 'system', agentId: agent?.id, subject: sub, gps, startedAt, device: 'mobile' });
    writeDraft(key, null);
    toast.success(t('mobile.surveys.submitted', { number: r.number }));
    navigate('/m/surveys');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={form.name} back />
      <MobileFormRenderer
        form={schema}
        answers={answers}
        onChange={setAnswers}
        finishLabel={online ? t('mobile.surveys.submit') : t('mobile.surveys.saveForSync')}
        onFinish={finish}
        onSaveDraft={() => { writeDraft(key, { answers, subject: sub }); toast.success(t('mobile.surveys.draftSaved')); navigate('/m/surveys'); }}
        before={form.subject ? [{ title: t(`set.dq.entityName.${form.subject}`), valid: !!subject, content: <SubjectPicker entity={form.subject} value={subject} onChange={setSubject} /> }] : undefined}
      />
    </div>
  );
}

/** A response the office sent back: the reviewer's comment, then the same form pre-filled. */
export function SurveyFixScreen() {
  const { responseId } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const { userId, orgId } = useActor();
  const r = useFormStore((s) => s.responses.find((x) => x.id === responseId));
  const form = useFormStore((s) => s.forms.find((f) => f.id === r?.formId));
  const lists = useFormStore((s) => s.optionLists);
  const schema = useMemo(() => {
    if (!form || !r) return null;
    const v = form.versions.find((x) => x.version === r.version) ?? latestVersion(form);
    return materialize(v?.schema ?? form.draft, lists.filter((l) => l.orgId === form.orgId));
  }, [form, r, lists]);
  const [answers, setAnswers] = useState<Answers>(r?.answers ?? {});
  if (!r || !form || !schema || r.orgId !== orgId) return <Missing />;
  const comment = [...r.reviews].reverse().find((x) => x.action === 'NEEDS_FIX')?.comment;
  if (r.status !== 'NEEDS_FIX') {
    return <div className="flex min-h-0 flex-1 flex-col"><MobileHeader title={r.number} back /><p className="flex items-center justify-center gap-2 px-6 py-10 text-center text-[15px] text-muted"><CheckCircle2 className="h-5 w-5 text-success" /> {t('mobile.surveys.fixDone')}</p></div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.surveys.fixTitle', { number: r.number })} back />
      <MobileFormRenderer
        form={schema}
        answers={answers}
        onChange={setAnswers}
        finishLabel={t('mobile.surveys.resubmit')}
        onFinish={() => { submitResponse({ form, schema, answers, userId: userId ?? 'system', agentId: r.agentId, subject: r.subject, device: 'mobile', replaces: r.id }); toast.success(t('mobile.surveys.resubmitted', { number: r.number })); navigate('/m/surveys'); }}
        before={[{ title: t('mobile.surveys.whyBack'), valid: true, content: (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-card bg-warning/10 p-4"><MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" /><p className="text-[15px] text-ink">{comment ?? t('mobile.surveys.noComment')}</p></div>
            <p className="text-[14px] text-muted">{t('mobile.surveys.fixHint', { name: form.name })}</p>
          </div>
        ) }]}
      />
    </div>
  );
}

/** The builder's "Preview mobile": the current draft, nothing is saved. */
export function FormPreviewScreen() {
  const { formId } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const form = useFormStore((s) => s.forms.find((f) => f.id === formId));
  const lists = useFormStore((s) => s.optionLists);
  const schema = useMemo(() => (form ? materialize(form.draft, lists.filter((l) => l.orgId === form.orgId)) : null), [form, lists]);
  const [answers, setAnswers] = useState<Answers>(() => (schema ? defaultAnswers(schema) : {}));
  if (!form || !schema) return <Missing />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.surveys.previewTitle', { name: form.name })} back />
      <p className="mx-5 mb-2 rounded-ctl bg-info/10 px-3 py-2 text-[13px] text-ink">{t('mobile.surveys.previewNote')}</p>
      <MobileFormRenderer form={schema} answers={answers} onChange={setAnswers} finishLabel={t('mobile.surveys.finishPreview')} onFinish={() => { toast.success(t('mobile.surveys.previewDone')); navigate('/m'); }} />
    </div>
  );
}
