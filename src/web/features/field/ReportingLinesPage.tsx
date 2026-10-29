import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Avatar } from '@/components/shared/Avatar';
import { reassignAgent } from '@/services/teamService';
import { cn } from '@/lib/utils';
import { useActor, useCan, useCurrentOrg, useT } from '@/stores/hooks';
import { AgentName, useFieldLookups } from './shared';

/** Reporting lines (PRD J1): company → supervisors → agents; drag an agent onto another supervisor to reassign (permission-gated). */
export function ReportingLinesPage() {
  const { t } = useT();
  const fl = useFieldLookups();
  const org = useCurrentOrg();
  const can = useCan();
  const { userId } = useActor();
  const editable = can('agents.reassign');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const agents = fl.agents.filter((a) => a.status !== 'DEACTIVATED');
  const unassigned = agents.filter((a) => !a.managerIds.length);
  const drop = (managerId: string) => {
    if (!drag) return;
    const a = fl.agent(drag)!;
    if (a.managerIds.includes(managerId)) { setDrag(null); setOver(null); return; }
    try { reassignAgent(drag, [managerId], userId ?? 'system'); toast.success(t('field.toast.movedTo', { name: fl.agentName(drag), manager: fl.user(managerId) })); }
    catch (e) { toast.error(t(`field.err.${(e as Error).message}`)); }
    setDrag(null); setOver(null);
  };
  return (
    <>
      <PageHeader eyebrow={<Link to="/app/agents" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> {t('nav.agents')}</Link>} title={t('nav.reportingLines')} description={t('pages.reportingLines')} />
      <div className="mb-4 flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-soft">
        <Avatar name={org.name} color="#14583F" size={36} />
        <div><div className="font-semibold text-ink">{org.name}</div><div className="text-[13px] text-muted">{t('field.orgChartHint', { supervisors: fl.supervisors.length, agents: agents.length })}</div></div>
        <span className="ml-auto text-[13px] text-muted">{editable ? t('field.dragHint') : t('field.readOnlyHint')}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {fl.supervisors.map((m) => {
          const team = agents.filter((a) => a.managerIds.includes(m));
          return (
            <section key={m} aria-label={fl.user(m)} onDragOver={(e) => { if (editable && drag) { e.preventDefault(); setOver(m); } }} onDragLeave={() => setOver(null)} onDrop={() => drop(m)}
              className={cn('min-w-0 rounded-card border bg-surface p-3 shadow-soft transition-colors', over === m ? 'border-brand bg-brand-soft/40' : 'border-line')}>
              <header className="mb-2 flex items-center gap-2 border-b border-line pb-2"><Avatar name={fl.user(m)} color={fl.userOf(m)?.avatarColor ?? '#6B7280'} size={30} /><div><div className="text-[14px] font-semibold text-ink">{fl.user(m)}</div><div className="text-[12px] text-muted">{t('field.agentsN', { count: team.length })}</div></div></header>
              <ul className="space-y-1.5">{team.map((a) => (
                <li key={a.id} draggable={editable} onDragStart={() => setDrag(a.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                  className={cn('flex min-w-0 flex-wrap items-center gap-2 rounded-ctl border border-line px-2 py-1.5 text-[13px]', editable && 'cursor-grab active:cursor-grabbing', drag === a.id && 'opacity-50')}>
                  {editable && <GripVertical className="h-3.5 w-3.5 text-muted" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate"><AgentName id={a.id} /></span>
                  <span className="text-[11px] text-muted">{fl.agentType(a.agentTypeId)}</span>
                  {editable && <select aria-label={t('field.moveTo', { name: fl.agentName(a.id) })} value="" onChange={(e) => { const to = e.target.value; if (!to) return; reassignAgent(a.id, [to], userId ?? 'system'); toast.success(t('field.toast.movedTo', { name: fl.agentName(a.id), manager: fl.user(to) })); }} className="h-7 max-w-[120px] rounded border border-line bg-surface px-1 text-[12px] text-muted"><option value="">{t('field.move')}</option>{fl.supervisors.filter((x) => x !== m).map((x) => <option key={x} value={x}>{fl.user(x)}</option>)}</select>}
                </li>
              ))}</ul>
            </section>
          );
        })}
        {unassigned.length > 0 && (
          <section className="rounded-card border border-dashed border-warning/60 bg-surface p-3"><h3 className="mb-2 text-[14px] font-semibold text-ink">{t('field.noManager')}</h3><ul className="space-y-1.5">{unassigned.map((a) => <li key={a.id} draggable={editable} onDragStart={() => setDrag(a.id)} className="rounded-ctl border border-line px-2 py-1.5 text-[13px]"><AgentName id={a.id} /></li>)}</ul></section>
        )}
      </div>
    </>
  );
}
