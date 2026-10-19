import { Fragment, useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowRight, Bot, Clock, Filter, GitFork, GripVertical, Plus, Trash2, Zap } from 'lucide-react';
import type { DocType, WorkflowDefinition, WorkflowStep } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/shared/Field';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PERMISSIONS } from '@/engines/permissions';
import { activeSteps } from '@/engines/workflow';
import { fromMinor, toMinor } from '@/engines/money';
import { recordsMovedBy } from '@/services/settingsService';
import { cn, uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActor, useCurrentOrg, useFormat, useLang, useOrgSettings, useRoleName, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { Mini, MoneyInput, NumberInput, Rows, Section, Segmented, Select, SettingsFrame, SwitchRow, TextInput } from '../kit';

export const DOC_TYPES: DocType[] = [
  'purchaseRequest', 'preExpense', 'aggregatorPurchase', 'aggregatorExpense', 'supportRequest', 'recoveryRequest', 'inventoryRepayment',
  'warehouseExpense', 'dispatchOrder', 'salesContract', 'weeklyBudget', 'retirementReview', 'monthlyAllowance', 'commissionPeriod',
  'surveyPublish', 'groupScoreReview', 'userInvite', 'plotVerification',
];

const DOC_RESOURCE: Record<DocType, string> = {
  purchaseRequest: 'purchaseRequests', preExpense: 'expenses', aggregatorPurchase: 'aggregators', aggregatorExpense: 'aggregators',
  supportRequest: 'support', recoveryRequest: 'recovery', inventoryRepayment: 'inbound', warehouseExpense: 'warehouseExpenses',
  dispatchOrder: 'dispatch', salesContract: 'salesContracts', weeklyBudget: 'budgets', retirementReview: 'retirements',
  monthlyAllowance: 'allowances', commissionPeriod: 'compensation', surveyPublish: 'forms', groupScoreReview: 'groups',
  userInvite: 'settings', plotVerification: 'plots',
};

const APPROVAL_ACTION = /^(approve|review|activate|confirm|verify|publish|manage|resolve|edit)/;

type CondField = 'none' | 'total' | 'commodityId' | 'variancePct';

function newWorkflow(orgId: string, docType: DocType): WorkflowDefinition {
  const resource = DOC_RESOURCE[docType];
  const perm = PERMISSIONS.find((p) => p.resource === resource && APPROVAL_ACTION.test(p.action))?.key ?? 'settings.edit';
  return {
    id: `wf_${orgId}_${docType}_${Date.now().toString(36)}`, docType, statuses: ['PENDING', 'APPROVED', 'REJECTED', 'ON_HOLD'],
    steps: [{ id: 's1', name: 'Approval', roleIds: [], permission: perm }], stepStatus: { s1: 'APPROVED' },
    initialStatus: 'PENDING', approvedStatus: 'APPROVED', rejectedStatus: 'REJECTED', heldStatus: 'ON_HOLD',
    holdAllowed: true, rejectReasonRequired: true, resumeFrom: 'same', separation: { requesterCannotApprove: true, sameUserNotTwoSteps: true },
  };
}

const KEYS = ['workflows'] as const;

/** Settings → Approvals (PRD A4, 8.1): a visual builder over the workflow engine definitions. */
export function ApprovalsPage() {
  const d = useSettingsDraft('approvals', KEYS);
  const { workflows } = d.value;
  const { orgId } = useActor();
  const { t } = useT();
  const [docType, setDocType] = useState<DocType>(workflows[0]?.docType ?? 'purchaseRequest');
  const def = workflows.find((w) => w.docType === docType);
  const setDef = (fn: (w: WorkflowDefinition) => WorkflowDefinition) => d.set('workflows', workflows.map((w) => (w.docType === docType ? fn(w) : w)));
  const missing = DOC_TYPES.filter((x) => !workflows.some((w) => w.docType === x));

  const moved = useMemo(() => workflows.reduce((n, w) => n + recordsMovedBy(orgId, w), 0), [workflows, orgId]);
  const errors: string[] = [];
  for (const w of workflows) {
    const label = t(`docType.${w.docType}`);
    if (!w.steps.length) errors.push(t('set.approvals.errNoSteps', { doc: label }));
    if (w.steps.some((s) => !s.name.trim())) errors.push(t('set.approvals.errName', { doc: label }));
    if (w.steps.length && w.steps.every((s) => s.auto)) errors.push(t('set.approvals.errAllAuto', { doc: label }));
  }

  return (
    <SettingsFrame page="approvals" {...bind(d)} errors={errors} saveConfirm={moved ? t('set.approvals.moved', { count: moved }) : null}>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('set.approvals.docTypes')}>
        {workflows.map((w) => (
          <button key={w.docType} type="button" role="tab" aria-selected={w.docType === docType} onClick={() => setDocType(w.docType)} className={cn('rounded-full border px-3.5 py-2 text-[14px] font-medium', w.docType === docType ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink hover:border-brand/40')}>
            {t(`docType.${w.docType}`)}
            <span className="ml-2 text-[12px] text-muted">{w.steps.length}</span>
          </button>
        ))}
        {missing.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm"><Plus /> {t('set.approvals.addWorkflow')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {missing.map((m) => (
                <DropdownMenuItem key={m} onSelect={() => { d.set('workflows', [...workflows, newWorkflow(orgId, m)]); setDocType(m); }}>{t(`docType.${m}`)}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {def ? <WorkflowEditor def={def} onChange={setDef} onRemove={() => { d.set('workflows', workflows.filter((w) => w.docType !== docType)); setDocType(workflows.find((w) => w.docType !== docType)?.docType ?? 'purchaseRequest'); }} /> : <p className="text-muted">{t('set.approvals.none')}</p>}
    </SettingsFrame>
  );
}

function WorkflowEditor({ def, onChange, onRemove }: { def: WorkflowDefinition; onChange: (fn: (w: WorkflowDefinition) => WorkflowDefinition) => void; onRemove: () => void }) {
  const { t } = useT();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const setStep = (id: string, patch: Partial<WorkflowStep>) => onChange((w) => ({ ...w, steps: w.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onChange((w) => {
      const from = w.steps.findIndex((s) => s.id === e.active.id);
      const to = w.steps.findIndex((s) => s.id === e.over!.id);
      return { ...w, steps: arrayMove(w.steps, from, to) };
    });
  };
  const addStep = () =>
    onChange((w) => {
      const id = uid('step');
      const last = w.steps[w.steps.length - 1];
      return { ...w, steps: [...w.steps, { id, name: t('set.approvals.newStep', { n: w.steps.length + 1 }), roleIds: [], permission: last?.permission ?? 'settings.edit' }] };
    });
  const removeStep = (id: string) =>
    onChange((w) => {
      const stepStatus = { ...w.stepStatus };
      delete stepStatus[id];
      return { ...w, steps: w.steps.filter((s) => s.id !== id), stepStatus };
    });

  return (
    <div className="grid gap-10 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-10">
        <Section title={t('set.approvals.steps')} description={t('set.approvals.stepsHint')} actions={<Button variant="dangerOutline" size="sm" onClick={onRemove}>{t('set.approvals.removeWorkflow')}</Button>}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={def.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-3">
                {def.steps.map((s, i) => (
                  <StepCard key={s.id} def={def} step={s} index={i} onChange={(patch) => setStep(s.id, patch)} onStatus={(status) => onChange((w) => ({ ...w, stepStatus: { ...w.stepStatus, [s.id]: status } }))} onRemove={() => removeStep(s.id)} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <Button variant="secondary" className="mt-3" onClick={addStep}><Plus /> {t('set.approvals.addStep')}</Button>
        </Section>

        <Section title={t('set.approvals.rules')}>
          <Rows>
            <SwitchRow label={t('set.approvals.requester')} description={t('set.approvals.requesterHint')} checked={def.separation.requesterCannotApprove} onChange={(v) => onChange((w) => ({ ...w, separation: { ...w.separation, requesterCannotApprove: v } }))} />
            <SwitchRow label={t('set.approvals.twoSteps')} description={t('set.approvals.twoStepsHint')} checked={def.separation.sameUserNotTwoSteps} onChange={(v) => onChange((w) => ({ ...w, separation: { ...w.separation, sameUserNotTwoSteps: v } }))} />
            <SwitchRow label={t('set.approvals.hold')} description={t('set.approvals.holdHint')} checked={def.holdAllowed} onChange={(v) => onChange((w) => ({ ...w, holdAllowed: v }))} />
            <SwitchRow label={t('set.approvals.reason')} description={t('set.approvals.reasonHint')} checked={def.rejectReasonRequired} onChange={(v) => onChange((w) => ({ ...w, rejectReasonRequired: v }))} />
          </Rows>
          <div className="mt-5">
            <Mini label={t('set.approvals.resume')}>
              <Segmented label={t('set.approvals.resume')} value={def.resumeFrom} onChange={(resumeFrom) => onChange((w) => ({ ...w, resumeFrom }))} options={(['same', 'previous'] as const).map((x) => ({ value: x, label: t(`set.approvals.resumeName.${x}`) }))} />
            </Mini>
          </div>
        </Section>
      </div>

      <aside className="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <FlowDiagram def={def} />
        <Simulator def={def} />
      </aside>
    </div>
  );
}

function StepCard({ def, step, index, onChange, onStatus, onRemove }: { def: WorkflowDefinition; step: WorkflowStep; index: number; onChange: (p: Partial<WorkflowStep>) => void; onStatus: (s: string) => void; onRemove: () => void }) {
  const { t } = useT();
  const { orgId } = useActor();
  const org = useCurrentOrg();
  const lang = useLang();
  const roleName = useRoleName();
  const allRoles = useAccessStore((s) => s.roles);
  const roles = useMemo(() => allRoles.filter((r) => r.orgId === orgId && !r.mobile), [allRoles, orgId]);
  const commodities = useOrgSettings().commodities;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const resource = DOC_RESOURCE[def.docType];
  const perms = PERMISSIONS.filter((p) => (p.resource === resource && APPROVAL_ACTION.test(p.action)) || p.key === step.permission);
  const cond = step.condition;
  const field: CondField = cond ? (cond.field as CondField) : 'none';
  const setCondField = (f: CondField) => {
    if (f === 'none') onChange({ condition: undefined });
    else if (f === 'total') onChange({ condition: { field: 'total', op: '>', value: toMinor(org.currency === 'XOF' ? 2_000_000 : 50_000, org.currency) } });
    else if (f === 'commodityId') onChange({ condition: { field: 'commodityId', op: 'in', value: commodities.slice(0, 1).map((c) => c.id) } });
    else onChange({ condition: { field: 'variancePct', op: 'aboveListPct', value: 10 } });
  };

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('rounded-card border bg-surface', isDragging ? 'z-10 border-brand shadow-lift' : 'border-line', step.auto && 'bg-canvas')}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" {...attributes} {...listeners} className="cursor-grab rounded p-1 text-muted hover:bg-canvas active:cursor-grabbing" aria-label={t('set.approvals.drag', { step: step.name })}>
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">{index + 1}</span>
        <TextInput value={step.name} onChange={(name) => onChange({ name })} className="h-9 max-w-sm font-medium" aria-label={t('set.approvals.stepName')} />
        <div className="ml-auto flex items-center gap-1.5">
          {step.auto && <Badge tone="info"><Bot className="h-3 w-3" /> {t('set.approvals.auto')}</Badge>}
          {step.parallel && <Badge tone="teal"><GitFork className="h-3 w-3" /> {t('set.approvals.parallel')}</Badge>}
          {cond && <Badge tone="warning"><Filter className="h-3 w-3" /> {t('set.approvals.conditional')}</Badge>}
          <Tip label={t('set.approvals.removeStep')}>
            <Button variant="ghost" size="iconSm" onClick={onRemove} aria-label={t('set.approvals.removeStep')} className="text-muted hover:text-danger"><Trash2 /></Button>
          </Tip>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <Mini label={t('set.approvals.permission')}>
          <Select value={step.permission} onChange={(permission) => onChange({ permission })} options={perms.map((p) => ({ value: p.key, label: `${t(`perm.resource.${p.resource}`)} · ${t(`perm.action.${p.action}`)}` }))} disabled={step.auto} />
        </Mini>
        <Mini label={t('set.approvals.statusAfter')}>
          <Select value={def.stepStatus[step.id] ?? ''} onChange={onStatus} options={[{ value: '', label: t('set.approvals.noStatus') }, ...def.statuses.map((s) => ({ value: s, label: t(`status.${s}`, { defaultValue: s }) }))]} />
        </Mini>
        <div className="md:col-span-2">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.approvals.roles')}</span>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => {
              const on = step.roleIds.includes(r.id);
              return (
                <button key={r.id} type="button" disabled={step.auto} aria-pressed={on} onClick={() => onChange({ roleIds: on ? step.roleIds.filter((x) => x !== r.id) : [...step.roleIds, r.id] })} className={cn('rounded-full border px-3 py-1 text-[13px] disabled:opacity-50', on ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body hover:border-brand/40')}>
                  {roleName(r.id)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">{step.roleIds.length ? t('set.approvals.rolesSome') : t('set.approvals.rolesAny')}</p>
        </div>

        <div className="md:col-span-2">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.approvals.condition')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-56" value={field} onChange={setCondField} options={(['none', 'total', 'commodityId', 'variancePct'] as const).map((x) => ({ value: x, label: t(`set.approvals.cond.${x}`) }))} aria-label={t('set.approvals.condition')} />
            {field === 'total' && cond && (
              <>
                <Select className="w-20" value={cond.op} onChange={(op) => onChange({ condition: { ...cond, op } })} options={(['>', '>=', '<'] as const).map((o) => ({ value: o, label: o }))} aria-label={t('set.approvals.operator')} />
                <MoneyInput className="w-48" minor={Number(cond.value)} currency={org.currency} onChange={(value) => onChange({ condition: { ...cond, value } })} aria-label={t('set.approvals.amount')} />
              </>
            )}
            {field === 'variancePct' && cond && (
              <NumberInput className="w-32" value={Number(cond.value)} suffix="%" min={0} onChange={(value) => onChange({ condition: { ...cond, value } })} aria-label={t('set.approvals.cond.variancePct')} />
            )}
            {field === 'commodityId' && cond && (
              <div className="flex flex-wrap gap-3">
                {commodities.map((c) => {
                  const list = (cond.value as string[]) ?? [];
                  return <Checkbox key={c.id} label={c.name[lang] ?? c.name.en ?? c.code} checked={list.includes(c.id)} onChange={(e) => onChange({ condition: { ...cond, value: e.target.checked ? [...list, c.id] : list.filter((x) => x !== c.id) } })} />;
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 md:col-span-2">
          <label className="flex items-center gap-2 text-[14px] text-body"><Switch checked={!!step.auto} onCheckedChange={(auto) => onChange({ auto })} /> {t('set.approvals.autoApprove')}</label>
          <label className="flex items-center gap-2 text-[14px] text-body"><Switch checked={!!step.parallel} onCheckedChange={(parallel) => onChange({ parallel })} disabled={step.auto} /> {t('set.approvals.parallelNext')}</label>
          <label className="flex items-center gap-2 text-[14px] text-body"><Switch checked={!!step.allowEditAmount} onCheckedChange={(allowEditAmount) => onChange({ allowEditAmount })} disabled={step.auto} /> {t('set.approvals.editAmount')}</label>
          <div className="flex items-center gap-2 text-[14px] text-body">
            {t('set.approvals.minApprovals')}
            <NumberInput className="w-20" value={step.minApprovals ?? 1} min={1} max={5} onChange={(v) => onChange({ minApprovals: Math.max(1, Math.round(v)) })} disabled={step.auto} aria-label={t('set.approvals.minApprovals')} />
          </div>
          <div className="flex items-center gap-2 text-[14px] text-body">
            <Clock className="h-4 w-4 text-muted" />
            <NumberInput className="w-24" value={step.slaHours ?? 0} min={0} suffix="h" onChange={(v) => onChange({ slaHours: v ? Math.round(v) : undefined })} disabled={step.auto} aria-label={t('set.approvals.sla')} />
          </div>
        </div>
      </div>
    </li>
  );
}

/** Live flow diagram: submitted → steps (parallel ones side by side, conditional ones dashed) → approved. */
function FlowDiagram({ def }: { def: WorkflowDefinition }) {
  const { t } = useT();
  const roleName = useRoleName();
  const f = useFormat();
  const groups: WorkflowStep[][] = [];
  for (const s of def.steps) {
    const prev = groups[groups.length - 1];
    if (prev && prev[prev.length - 1]!.parallel) prev.push(s);
    else groups.push([s]);
  }
  const condLabel = (s: WorkflowStep) => {
    const c = s.condition;
    if (!c) return null;
    if (c.field === 'total') return t('set.approvals.when.total', { op: c.op, amount: f.money(Number(c.value)) });
    if (c.field === 'variancePct') return t('set.approvals.when.variance', { pct: c.value });
    return t('set.approvals.when.commodity', { count: (c.value as string[]).length });
  };
  const node = (label: string, tone: string) => <div className={cn('rounded-full px-3 py-1.5 text-center text-[12px] font-semibold', tone)}>{label}</div>;
  return (
    <div className="rounded-card border border-line bg-canvas p-5" aria-label={t('set.approvals.diagram')}>
      <div className="eyebrow mb-4">{t('set.approvals.diagram')}</div>
      <div className="flex flex-col items-stretch gap-1.5">
        {node(t('set.approvals.submitted'), 'bg-surface text-ink border border-line')}
        {groups.map((g, i) => (
          <Fragment key={i}>
            <ArrowDown className="mx-auto h-4 w-4 text-muted" aria-hidden="true" />
            <div className={cn('grid gap-2', g.length > 1 && 'grid-cols-2')}>
              {g.map((s) => (
                <div key={s.id} className={cn('rounded-ctl border bg-surface px-3 py-2.5', s.condition ? 'border-dashed border-warning/60' : 'border-line', s.auto && 'border-info/40')}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    {s.auto ? <Zap className="h-3.5 w-3.5 text-info" /> : null}
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {s.auto ? t('set.approvals.automatic') : s.roleIds.length ? s.roleIds.map(roleName).join(', ') : t(`perm.action.${s.permission.split('.')[1]}`)}
                    {(s.minApprovals ?? 1) > 1 && ` · ×${s.minApprovals}`}
                  </div>
                  {condLabel(s) && <div className="mt-1 text-[11px] font-medium text-warning">{condLabel(s)}</div>}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
        <ArrowDown className="mx-auto h-4 w-4 text-muted" aria-hidden="true" />
        {node(t(`status.${def.approvedStatus}`, { defaultValue: def.approvedStatus }), 'bg-success/10 text-success')}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
        {def.separation.requesterCannotApprove && <Badge tone="neutral">{t('set.approvals.chipRequester')}</Badge>}
        {def.separation.sameUserNotTwoSteps && <Badge tone="neutral">{t('set.approvals.chipTwoSteps')}</Badge>}
        {def.holdAllowed && <Badge tone="neutral">{t('set.approvals.chipHold', { from: t(`set.approvals.resumeName.${def.resumeFrom}`).toLocaleLowerCase() })}</Badge>}
      </div>
    </div>
  );
}

/** Try a record against the definition: which steps would it go through? */
function Simulator({ def }: { def: WorkflowDefinition }) {
  const { t } = useT();
  const org = useCurrentOrg();
  const lang = useLang();
  const commodities = useOrgSettings().commodities;
  const [total, setTotal] = useState(toMinor(org.currency === 'XOF' ? 1_500_000 : 20_000, org.currency));
  const [commodityId, setCommodityId] = useState(commodities[0]?.id ?? '');
  const [variance, setVariance] = useState(0);
  const record = { total: { amountMinor: total, currency: org.currency }, commodityId, variancePct: variance };
  const path = activeSteps(def, record);
  return (
    <div className="rounded-card border border-line p-5">
      <div className="eyebrow mb-3">{t('set.approvals.try')}</div>
      <div className="grid grid-cols-2 gap-3">
        <Mini label={t('set.approvals.amount')} className="col-span-2"><MoneyInput minor={total} currency={org.currency} onChange={setTotal} /></Mini>
        <Mini label={t('set.units.commodity')}><Select value={commodityId} onChange={setCommodityId} options={commodities.map((c) => ({ value: c.id, label: c.name[lang] ?? c.name.en ?? c.code }))} /></Mini>
        <Mini label={t('set.approvals.cond.variancePct')}><NumberInput value={variance} suffix="%" onChange={setVariance} /></Mini>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px]" aria-live="polite">
        {path.length ? (
          path.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
              <span className={cn('rounded-full px-2.5 py-1 font-medium', s.auto ? 'bg-info/10 text-info' : 'bg-brand-soft text-brand')}>{s.name}</span>
            </Fragment>
          ))
        ) : (
          <span className="text-muted">{t('set.approvals.straightThrough')}</span>
        )}
      </div>
      <p className="mt-2 text-[12px] text-muted">{t('set.approvals.tryHint', { count: path.filter((s) => !s.auto).length, amount: fromMinor(total, org.currency) })}</p>
    </div>
  );
}
