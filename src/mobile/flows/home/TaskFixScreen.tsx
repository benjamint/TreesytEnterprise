import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Mic, PenLine, SquareCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { applyFix } from '@/services/qualityService';
import { getPath, uid } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { toE164 } from '@/services/importService';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useActor, useCurrentOrg, useOrgSettings, useT } from '@/stores/hooks';
import { fixInput, ruleLabel } from '@/web/features/people/quality';

type Consent = { type: 'AUDIO' | 'SIGNATURE' | 'TICK'; capturedAt: string };

/** M4 "Fix data-quality task": the flagged fields with their reasons; saving re-checks the record. */
export function TaskFixScreen() {
  const { taskId } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const { userId, orgId } = useActor();
  const org = useCurrentOrg();
  const settings = useOrgSettings();
  const online = useMobileSessionStore((s) => s.online);
  const task = useQualityStore((s) => s.tasks.find((x) => x.id === taskId));
  const allIssues = useQualityStore((s) => s.issues);
  const issues = useMemo(() => allIssues.filter((i) => task?.issueIds.includes(i.id)), [allIssues, task]);
  const farmer = useFarmerStore((s) => s.farmers.find((x) => x.id === task?.recordId));
  const community = useCommunityStore((s) => s.communities.find((x) => x.id === task?.recordId));
  const record = (farmer ?? community) as unknown as Record<string, unknown> | undefined;
  const age = farmer ? Math.floor((Date.now() - new Date(farmer.dateOfBirth).getTime()) / 31_557_600_000) : undefined;
  const current = (field: string) => (field === 'age' ? age : record ? getPath(record, field) : undefined);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((task?.fields ?? []).map((fl) => [fl, fixInput(fl) === 'phone' ? '' : fl === 'age' ? String(age ?? '') : String(current(fl) ?? '')])));
  const [consent, setConsent] = useState<Consent | null>(null);
  const [saving, setSaving] = useState(false);
  const country = org.countries[0] ?? 'GH';

  if (!task || !record || task.orgId !== orgId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.fix.title')} back />
        <p className="px-6 py-10 text-center text-[15px] text-muted">{t('mobile.fix.notFound')}</p>
      </div>
    );
  }
  const name = farmer ? `${farmer.firstName} ${farmer.lastName}` : community!.name;
  const done = task.status === 'DONE';

  const save = async () => {
    const out: Record<string, unknown> = {};
    for (const fl of task.fields) {
      const kind = fixInput(fl);
      if (kind === 'consent') { if (consent) out[fl] = consent; continue; }
      const raw = values[fl]?.trim() ?? '';
      if (!raw) continue;
      out[fl] = kind === 'number' ? Number(raw) : kind === 'phone' ? toE164(raw, country) : raw;
    }
    if (!Object.keys(out).length) return toast.error(t('mobile.fix.nothing'));
    setSaving(true);
    if (!online) {
      useOutboxStore.getState().add({ id: uid('ob'), orgId, userId: userId ?? '', type: 'qualityFix', label: t('mobile.fix.outboxLabel', { name }), payload: { taskId: task.id, values: out }, createdAt: new Date().toISOString() });
      toast.success(t('mobile.fix.savedOffline'));
      navigate('/m/tasks');
      return;
    }
    await new Promise((r) => setTimeout(r, 450));
    const res = applyFix(task.id, out, userId ?? 'system', 'mobile');
    setSaving(false);
    if (res.remaining) toast.warning(t('mobile.fix.stillFailing', { count: res.remaining }));
    else toast.success(t('mobile.fix.resolved', { count: res.resolved, name }));
    navigate('/m/tasks');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.fix.title')} back />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-2">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="text-[18px] font-semibold text-ink">{name}</div>
          <div className="text-[13px] text-body">{farmer ? `${farmer.farmerCode} · ${formatPhone(farmer.phone)}` : community!.code}</div>
          {task.note && <p className="mt-2 rounded-ctl bg-surface px-3 py-2 text-[14px] text-ink">{task.note}</p>}
        </div>
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.fix.why')}</h2>
          <ul className="space-y-2">
            {issues.map((i) => (
              <li key={i.id} className={`rounded-ctl px-4 py-3 text-[14px] ${i.status === 'RESOLVED' ? 'bg-success/10' : 'bg-warning/10'}`}>
                <span className="block font-medium text-ink">{ruleLabel(settings.qualityRules.find((r) => r.id === i.ruleId), t)}</span>
                <span className="block text-[13px] text-muted">{t('mobile.fix.recorded', { value: i.params.value == null || i.params.value === '' ? '—' : typeof i.params.value === 'object' ? '…' : String(i.params.value) })}</span>
              </li>
            ))}
          </ul>
        </section>
        {done ? (
          <p className="flex items-center gap-2 rounded-ctl bg-success/10 px-4 py-3 text-[14px] text-ink"><CheckCircle2 className="h-5 w-5 text-success" /> {t('mobile.fix.alreadyDone')}</p>
        ) : (
          <section className="space-y-4">
            <h2 className="eyebrow">{t('mobile.fix.correct')}</h2>
            {task.fields.map((fl) => {
              const kind = fixInput(fl);
              const label = t(`set.dq.fieldName.${fl.replace('.', '_')}`, { defaultValue: fl });
              if (kind === 'consent') {
                return (
                  <div key={fl}>
                    <div className="mb-2 text-[14px] font-medium text-ink">{label}</div>
                    <p className="mb-3 rounded-ctl bg-canvas px-3 py-2 text-[13px] text-body">{settings.biometrics.consentText[org.language] ?? settings.biometrics.consentText.en}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([['AUDIO', Mic], ['SIGNATURE', PenLine], ['TICK', SquareCheck]] as const).map(([type, Icon]) => (
                        <button key={type} type="button" onClick={() => setConsent({ type, capturedAt: new Date().toISOString() })} aria-pressed={consent?.type === type} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-ctl border text-[13px] ${consent?.type === type ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body'}`}>
                          <Icon className="h-5 w-5" aria-hidden="true" />{t(`people.farmer.consentType.${type}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <label key={fl} className="block">
                  <span className="mb-1.5 block text-[14px] font-medium text-ink">{label}</span>
                  <Input type={kind === 'number' ? 'number' : kind === 'phone' ? 'tel' : 'text'} inputMode={kind === 'number' ? 'numeric' : kind === 'phone' ? 'tel' : undefined} value={values[fl] ?? ''} onChange={(e) => setValues({ ...values, [fl]: e.target.value })} placeholder={kind === 'phone' ? formatPhone(String(current(fl) ?? '')) : undefined} aria-label={label} />
                  {kind === 'phone' && <span className="mt-1 block text-[12px] text-muted">{t('mobile.fix.phoneHint')}</span>}
                </label>
              );
            })}
          </section>
        )}
      </div>
      {!done && (
        <div className="shrink-0 border-t border-line p-4">
          <Button size="lg" className="w-full" onClick={() => void save()} disabled={saving}>{saving ? t('mobile.fix.saving') : t('mobile.fix.save')}</Button>
        </div>
      )}
    </div>
  );
}
