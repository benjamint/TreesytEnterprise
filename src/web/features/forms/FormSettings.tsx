import { useMemo, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FormAssignment, FormRecord } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/shared/Field';
import { publishForm, setFormStatus } from '@/services/formService';
import { cn } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useFormStore } from '@/stores/formStore';
import { useLocationStore } from '@/stores/locationStore';
import { useActor, useCan, useLang, useOrgRows, useOrgSettings, useRoleName, useT } from '@/stores/hooks';

const sel = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';
const STEPS: FormRecord['status'][] = ['DRAFT', 'TEST', 'LIVE', 'CLOSED'];

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
const Label = ({ text, children }: { text: string; children: ReactNode }) => <label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{text}</span>{children}</label>;

/** Form settings, lifecycle and assignment (PRD G1 Lifecycle, Assignment). */
export function FormSettings({ form }: { form: FormRecord }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const lang = useLang();
  const can = useCan();
  const roleName = useRoleName();
  const settings = useOrgSettings();
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const agents = useOrgRows(useAgentStore((s) => s.agents));
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const members = useMemo(() => memberships.filter((m) => m.orgId === orgId && m.status === 'ACTIVE').map((m) => ({ m, u: users.find((u) => u.id === m.userId)! })).filter((x) => x.u), [memberships, users, orgId]);
  const mobileMembers = members.filter((x) => agents.some((a) => a.userId === x.u.id));
  const edit = can('forms.edit');
  const update = (patch: Partial<FormRecord>) => useFormStore.getState().updateForm(form.id, patch);
  const a = form.assignment;
  const setA = (patch: Partial<FormAssignment>) => update({ assignment: { ...a, ...patch } });
  const top = nodes.filter((n) => n.levelId === settings.locationLevels[0]?.id);
  const choices: { id: string; label: string }[] =
    a.mode === 'roles' ? roles.filter((r) => r.orgId === orgId).map((r) => ({ id: r.id, label: roleName(r.id) }))
      : a.mode === 'agentTypes' ? settings.agentTypes.map((x) => ({ id: x.id, label: x.name[lang] ?? x.name.en ?? x.id }))
      : a.mode === 'locations' ? top.map((n) => ({ id: n.id, label: n.name }))
      : a.mode === 'users' ? mobileMembers.map((x) => ({ id: x.u.id, label: x.u.name })) : [];
  const reached = useMemo(() => {
    if (a.mode === 'all') return agents.length;
    if (a.mode === 'agentTypes') return agents.filter((x) => a.ids.includes(x.agentTypeId)).length;
    if (a.mode === 'users') return a.ids.length;
    if (a.mode === 'locations') return agents.filter((x) => x.areaNodeIds.some((id) => { let n = nodes.find((y) => y.id === id); while (n) { if (a.ids.includes(n.id)) return true; n = nodes.find((y) => y.id === n!.parentId); } return false; })).length;
    return members.filter((x) => x.m.roleIds.some((r) => a.ids.includes(r)) && agents.some((ag) => ag.userId === x.u.id)).length;
  }, [a, agents, nodes, members]);
  const move = (to: FormRecord['status']) => {
    if (to === 'LIVE' && (!form.versions.length || form.status === 'TEST')) {
      const r = publishForm(form.id, userId ?? 'system', form.status === 'TEST' ? t('forms.fromTest') : undefined);
      toast.success(t('forms.published', { n: r.version }));
      return;
    }
    setFormStatus(form.id, to, userId ?? 'system');
    toast.success(t('forms.statusSet', { status: t(`forms.status.${to}`) }));
  };

  return (
    <fieldset disabled={!edit} className="grid gap-4 lg:grid-cols-2">
      <Card title={t('forms.set.details')}>
        <Label text={t('col.name')}><Input compact value={form.name} onChange={(e) => update({ name: e.target.value })} aria-label={t('col.name')} /></Label>
        <Label text={t('forms.set.description')}><textarea value={form.description ?? ''} onChange={(e) => update({ description: e.target.value })} rows={2} aria-label={t('forms.set.description')} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink" /></Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text={t('forms.binding')}><Input compact value={t(`forms.bindingName.${form.binding}`)} disabled aria-label={t('forms.binding')} /></Label>
          {form.binding === 'survey' && (
            <Label text={t('forms.subject')}>
              <select className={sel} value={form.subject ?? ''} onChange={(e) => update({ subject: (e.target.value || undefined) as FormRecord['subject'] })} aria-label={t('forms.subject')}>
                <option value="">{t('forms.noSubject')}</option>
                {(['farmer', 'community', 'farmerGroup'] as const).map((s) => <option key={s} value={s}>{t(`set.dq.entityName.${s}`)}</option>)}
              </select>
            </Label>
          )}
          {form.binding === 'groupProfile' && (
            <Label text={t('forms.set.groupType')}>
              <select className={sel} value={form.groupType ?? ''} onChange={(e) => update({ groupType: e.target.value || undefined })} aria-label={t('forms.set.groupType')}>
                <option value="">{t('forms.set.allGroupTypes')}</option>
                {(['COOPERATIVE', 'VSLA', 'WOMENS_GROUP', 'PRODUCER_GROUP'] as const).map((g) => <option key={g} value={g}>{t(`groupType.${g}`)}</option>)}
              </select>
            </Label>
          )}
        </div>
      </Card>

      <Card title={t('forms.set.lifecycle')} hint={t('forms.set.lifecycleHint')}>
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium', form.status === s ? 'border-brand bg-brand text-on-brand' : STEPS.indexOf(form.status) > i ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line text-muted')}>
                {STEPS.indexOf(form.status) > i && <CheckCircle2 className="h-3.5 w-3.5" />}{t(`forms.status.${s}`)}
              </span>
              {i < STEPS.length - 1 && <span className="text-line">{'→'}</span>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {form.status === 'DRAFT' && <Button variant="secondary" onClick={() => move('TEST')}>{t('forms.set.toTest')}</Button>}
          {(form.status === 'DRAFT' || form.status === 'TEST' || form.status === 'CLOSED') && can('forms.publish') && <Button onClick={() => move('LIVE')}>{form.status === 'CLOSED' ? t('forms.set.reopen') : t('forms.set.goLive')}</Button>}
          {form.status === 'LIVE' && can('forms.publish') && <Button variant="secondary" onClick={() => move('CLOSED')}>{t('forms.closeForm')}</Button>}
        </div>
        {form.status === 'TEST' && (
          <Label text={t('forms.set.testUsers')}>
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded-ctl border border-line p-3 sm:grid-cols-2">
              {mobileMembers.map(({ u }) => <Checkbox key={u.id} label={u.name} checked={form.testUserIds.includes(u.id)} onChange={(e) => update({ testUserIds: e.target.checked ? [...form.testUserIds, u.id] : form.testUserIds.filter((x) => x !== u.id) })} />)}
            </div>
            <span className="mt-1 block text-[12px] text-muted">{t('forms.set.testHint')}</span>
          </Label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text={t('forms.set.start')}><Input compact type="date" value={form.schedule.start ?? ''} onChange={(e) => update({ schedule: { ...form.schedule, start: e.target.value || undefined } })} aria-label={t('forms.set.start')} /></Label>
          <Label text={t('forms.set.end')}><Input compact type="date" value={form.schedule.end ?? ''} onChange={(e) => update({ schedule: { ...form.schedule, end: e.target.value || undefined } })} aria-label={t('forms.set.end')} /></Label>
        </div>
      </Card>

      <Card title={t('forms.set.assignment')} hint={t('forms.set.assignmentHint', { count: reached })}>
        <Label text={t('forms.set.assignTo')}>
          <select className={sel} value={a.mode} onChange={(e) => setA({ mode: e.target.value as FormAssignment['mode'], ids: [] })} aria-label={t('forms.set.assignTo')}>
            {(['all', 'roles', 'agentTypes', 'locations', 'users'] as const).map((m) => <option key={m} value={m}>{t(`forms.assign.${m}`)}</option>)}
          </select>
        </Label>
        {choices.length > 0 && (
          <div className="grid max-h-48 gap-2 overflow-y-auto rounded-ctl border border-line p-3 sm:grid-cols-2">
            {choices.map((c) => <Checkbox key={c.id} label={c.label} checked={a.ids.includes(c.id)} onChange={(e) => setA({ ids: e.target.checked ? [...a.ids, c.id] : a.ids.filter((x) => x !== c.id) })} />)}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text={t('forms.set.target')}><Input compact type="number" min={0} value={a.targetPerAgent ?? ''} onChange={(e) => setA({ targetPerAgent: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label={t('forms.set.target')} /></Label>
          <Label text={t('forms.set.due')}><Input compact type="date" value={a.dueDate ?? ''} onChange={(e) => setA({ dueDate: e.target.value || undefined })} aria-label={t('forms.set.due')} /></Label>
        </div>
      </Card>
    </fieldset>
  );
}
