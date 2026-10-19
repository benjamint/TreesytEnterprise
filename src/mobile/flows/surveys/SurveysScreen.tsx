import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardCheck, FlaskConical, MessageSquareWarning } from 'lucide-react';
import type { Agent, FormRecord, LocationNode, Membership } from '@/types';
import { PROFILE_BINDINGS } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { useFormStore } from '@/stores/formStore';
import { useLocationStore } from '@/stores/locationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useActor, useFormat, useOrgRows, useT } from '@/stores/hooks';

/** Is this form assigned to the agent on this phone? (PRD G1 Assignment) */
export function isAssigned(form: FormRecord, userId: string, agent: Agent | undefined, membership: Membership | undefined, nodes: LocationNode[]): boolean {
  if (form.status === 'TEST') return form.testUserIds.includes(userId);
  if (form.status !== 'LIVE' || PROFILE_BINDINGS.includes(form.binding)) return false;
  const today = new Date().toISOString().slice(0, 10);
  if ((form.schedule.start && form.schedule.start > today) || (form.schedule.end && form.schedule.end < today)) return false;
  const a = form.assignment;
  switch (a.mode) {
    case 'all': return true;
    case 'users': return a.ids.includes(userId);
    case 'agentTypes': return !!agent && a.ids.includes(agent.agentTypeId);
    case 'roles': return !!membership && membership.roleIds.some((r) => a.ids.includes(r));
    case 'locations': return !!agent && agent.areaNodeIds.some((id) => { let n = nodes.find((x) => x.id === id); while (n) { if (a.ids.includes(n.id)) return true; n = nodes.find((x) => x.id === n!.parentId); } return false; });
    default: return false;
  }
}

/** M10 Surveys: assigned forms with targets and due dates, plus responses sent back to fix. */
export function SurveysScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { userId } = useActor();
  const { agent, membership } = useMobileAgent();
  const forms = useOrgRows(useFormStore((s) => s.forms));
  const responses = useFormStore((s) => s.responses);
  const tasks = useQualityStore((s) => s.tasks);
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const assigned = useMemo(() => forms.filter((x) => isAssigned(x, userId ?? '', agent, membership, nodes)), [forms, userId, agent, membership, nodes]);
  const mine = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of responses) if (r.userId === userId) m.set(r.formId, (m.get(r.formId) ?? 0) + 1);
    return m;
  }, [responses, userId]);
  const fixes = useMemo(() => tasks.filter((x) => x.kind === 'surveyFix' && x.status === 'OPEN' && x.agentId === agent?.id).map((x) => ({ task: x, r: responses.find((r) => r.id === x.recordId) })).filter((x) => x.r), [tasks, responses, agent?.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.surveys.title')} back />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-2">
        {fixes.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2">{t('mobile.surveys.needsFix', { count: fixes.length })}</h2>
            <ul className="divide-y divide-line rounded-card border border-warning/40 bg-warning/5">
              {fixes.map(({ task, r }) => (
                <li key={task.id}>
                  <button type="button" onClick={() => navigate(`/m/surveys/fix/${r!.id}`)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left">
                    <MessageSquareWarning className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{forms.find((x) => x.id === r!.formId)?.name} · <span className="font-mono text-[13px]">{r!.number}</span></span>
                      {task.note && <span className="block truncate text-[13px] text-body">{task.note}</span>}
                    </span>
                    <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.surveys.assigned')}</h2>
          {assigned.length ? (
            <ul className="space-y-2">
              {assigned.map((x) => {
                const done = mine.get(x.id) ?? 0;
                const target = x.assignment.targetPerAgent;
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => navigate(`/m/surveys/${x.id}`)} className="w-full rounded-card border border-line p-4 text-left active:bg-brand-soft">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{x.status === 'TEST' ? <FlaskConical className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{x.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                            {x.status === 'TEST' && <Badge tone="info">{t('forms.status.TEST')}</Badge>}
                            {x.subject && <span>{t('mobile.surveys.about', { what: t(`set.dq.entityName.${x.subject}`).toLocaleLowerCase() })}</span>}
                            {x.assignment.dueDate && <span>{t('mobile.surveys.due', { date: f.date(x.assignment.dueDate) })}</span>}
                          </span>
                        </span>
                        <ChevronRight className="mt-2 h-5 w-5 text-muted" aria-hidden="true" />
                      </div>
                      {target ? (
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-[12px]"><span className="text-muted">{t('mobile.surveys.progress')}</span><span className="tnum font-medium text-ink">{done} / {target}</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (done / target) * 100)}%` }} /></div>
                        </div>
                      ) : <div className="mt-2 text-[12px] text-muted">{t('mobile.surveys.sent', { count: done })}</div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-[15px] text-muted">{t('mobile.surveys.none')}</p>}
        </section>
      </div>
    </div>
  );
}
