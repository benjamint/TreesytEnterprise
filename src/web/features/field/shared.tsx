import { useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Agent } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { activityName, addDays, agentBlocks, mondayOf } from '@/services/fieldService';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';

/** Names for field-team screens: agents, users, activities, categories, agent types. */
export function useFieldLookups() {
  const settings = useOrgSettings();
  const lang = useLang();
  const users = useAccessStore((s) => s.users);
  const agents = useOrgRows(useAgentStore((s) => s.agents));
  return useMemo(() => {
    const un = new Map(users.map((u) => [u.id, u]));
    const am = new Map(agents.map((a) => [a.id, a]));
    const ft = settings.fieldTeam;
    return {
      agents,
      agent: (id?: string) => (id ? am.get(id) : undefined),
      agentName: (id?: string) => (id ? un.get(am.get(id)?.userId ?? '')?.name ?? '—' : '—'),
      user: (id?: string) => (id ? un.get(id)?.name ?? (id === 'system' ? 'TreeSyt' : id) : '—'),
      userOf: (id: string) => un.get(id),
      activities: ft.activities,
      activity: (id: string) => activityName(ft.activities.find((a) => a.id === id), lang === 'fr' ? 'fr' : 'en'),
      unit: (id: string) => ft.activities.find((a) => a.id === id)?.unit ?? '',
      category: (id: string) => ft.costCategories.find((c) => c.id === id)?.name ?? id,
      issue: (id: string) => ft.issueCategories.find((c) => c.id === id),
      agentType: (id: string) => { const x = settings.agentTypes.find((t) => t.id === id); return x ? x.name[lang] ?? x.name.en ?? x.code : id; },
      supervisors: [...new Set(agents.flatMap((a) => a.managerIds))].filter((id) => un.has(id)),
    };
  }, [settings, lang, users, agents]);
}

/** Agent name with a flag chip when they have open reports (PRD J10: shown on records they touch). */
export function AgentName({ id, plain }: { id?: string; plain?: boolean }) {
  const { t } = useT();
  const lk = useFieldLookups();
  useFieldStore((s) => s.reports);
  const a = lk.agent(id);
  const blocks = a ? agentBlocks(a.orgId, a.id) : undefined;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={plain ? '' : 'font-medium text-ink'}>{lk.agentName(id)}</span>
      {blocks?.flagged && (
        <Tip label={t('field.flagTip', { severity: t(`rep.severity.${blocks.worst ?? 'LOW'}`) })}>
          <span className={blocks.worst === 'CRITICAL' || blocks.worst === 'HIGH' ? 'text-danger' : 'text-warning'} aria-label={t('field.flagged')}><AlertTriangle className="h-3.5 w-3.5" /></span>
        </Tip>
      )}
    </span>
  );
}

const TONES: Record<string, 'info' | 'success' | 'danger' | 'warning' | 'neutral' | 'brand' | 'done'> = {
  DRAFT: 'neutral', PUBLISHED: 'info', CLOSED: 'done', SUBMITTED: 'info', MANAGER_APPROVED: 'brand', EXTRA_APPROVED: 'brand', APPROVED: 'success', REJECTED: 'danger', ON_HOLD: 'warning',
  PAYING: 'info', RETIREMENT_OPEN: 'warning', PENDING_SUBMISSION: 'neutral', PENDING_REVIEW: 'info', PENDING_RESUBMISSION: 'warning', AWAITING_REFUND: 'warning', RETIRED: 'done',
  PENDING: 'warning', PARTIAL: 'info', WAIVED: 'neutral', PREVIEW: 'neutral', PAID: 'done', ELIGIBLE: 'success', NOT_ELIGIBLE: 'neutral', FAILED: 'danger',
  IN_REVIEW: 'info', CONFIRMED: 'success', FIRST_APPROVED: 'brand', OPEN: 'danger', IN_PROGRESS: 'warning', RESOLVED: 'success', INVITED: 'warning', ACTIVE: 'success', DEACTIVATED: 'neutral',
};
export function FieldStatus({ status }: { status: string }) {
  const { t } = useT();
  return <Badge tone={TONES[status] ?? 'neutral'}>{t(`field.status.${status}`, { defaultValue: status })}</Badge>;
}

/** Week of … with previous / next. */
export function WeekPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('field.week')}>
      <Button size="sm" variant="ghost" onClick={() => onChange(addDays(value, -7))} aria-label={t('field.prevWeek')}><ChevronLeft /></Button>
      <span className="min-w-[150px] text-center text-[14px] font-medium text-ink">{t('field.weekOf', { date: f.date(value, 'd MMM yyyy') })}</span>
      <Button size="sm" variant="ghost" onClick={() => onChange(addDays(value, 7))} aria-label={t('field.nextWeek')}><ChevronRight /></Button>
      {value !== mondayOf(new Date()) && <Button size="sm" variant="secondary" onClick={() => onChange(mondayOf(new Date()))}>{t('field.thisWeek')}</Button>}
    </div>
  );
}

/** Percent cell coloured on a single-hue scale (with the number, never colour alone). */
export function PctCell({ pct, children }: { pct: number; children?: React.ReactNode }) {
  const step = pct >= 100 ? 'bg-brand text-white' : pct >= 70 ? 'bg-brand/60 text-white' : pct >= 40 ? 'bg-brand/30 text-ink' : pct > 0 ? 'bg-brand/10 text-ink' : 'bg-canvas text-muted';
  return <span className={`inline-flex min-w-[64px] flex-col items-center rounded-[6px] px-2 py-1 text-[12px] tnum ${step}`}>{children}<span className="font-semibold">{`${pct}%`}</span></span>;
}

export const selectCls = 'h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink';

export type { Agent };
