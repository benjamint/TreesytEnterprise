import { useMemo, useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { TabEmpty } from '@/components/shared/ListKit';
import { HBars, Lines } from '@/components/charts/charts';
import { agentScore, managerScore, modelFor, recalculateScores, scoreRows, scoreTrend } from '@/services/teamService';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agentStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { AgentName, selectCls, useFieldLookups } from './shared';

/** Scores (PRD J8): per agent-type score card, year selector, leaderboard, breakdown with targets, trend; manager roll-up. */
export function ScoresPage() {
  const { t } = useT();
  const f = useFormat();
  const fl = useFieldLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const agents = useOrgRows(useAgentStore((s) => s.agents));
  const models = settings.fieldTeam.scoreModels;
  const [typeId, setTypeId] = useState(models[0]?.agentTypeId ?? '');
  const [tab, setTab] = useState<'agents' | 'managers'>('agents');
  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const rows = useMemo(() => scoreRows(orgId), [orgId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const scored = useMemo(() => agents.filter((a) => a.status !== 'DEACTIVATED' && modelFor(orgId, a.agentTypeId)).map((a) => ({ agent: a, s: agentScore(a, year, undefined, rows)! })), [agents, orgId, year, rows]);
  const board = scored.filter((x) => x.agent.agentTypeId === typeId).sort((a, b) => b.s.total - a.s.total);
  const model = models.find((m) => m.agentTypeId === typeId);
  const pick = board.find((x) => x.agent.id === selected) ?? board[0];
  const trend = useMemo(() => (pick ? scoreTrend(pick.agent, year, rows) : []), [pick, year, rows]);
  const all = new Map(scored.map((x) => [x.agent.id, x.s.total]));
  const managers = fl.supervisors.map((m) => ({ id: m, score: managerScore(orgId, m, all), count: agents.filter((a) => a.managerIds.includes(m) && all.has(a.id)).length })).filter((x) => x.score != null).sort((a, b) => b.score! - a.score!);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.fieldTeam')} title={t('nav.scores')} description={t('pages.scores')}
        primary={<PermissionGate permission="scores.recalculate"><Button onClick={() => { recalculateScores(orgId, userId ?? 'system', year); setTick(tick + 1); toast.success(t('field.toast.scores')); }}><RefreshCw /> {t('field.recalculate')}</Button></PermissionGate>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border-b border-line" role="tablist">{(['agents', 'managers'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>{t(`field.scoreTab.${k}`)}</button>)}</div>
        {tab === 'agents' && <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setSelected(null); }} aria-label={t('field.agentType')} className={`${selectCls} max-w-xs`}>{models.map((m) => <option key={m.id} value={m.agentTypeId}>{fl.agentType(m.agentTypeId ?? '')}</option>)}</select>}
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('field.year')} className={`${selectCls} w-28`}>{[thisYear, thisYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
      </div>
      {!models.length ? <TabEmpty>{t('field.noScoreModels')}</TabEmpty> : tab === 'managers' ? (
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <h3 className="mb-1 text-[14px] font-semibold text-ink">{t('field.managerScores')}</h3>
          <p className="mb-3 text-[13px] text-muted">{t(`field.managerScoreHow.${settings.fieldTeam.managerScore}`)}</p>
          <HBars data={managers.map((m) => ({ label: `${fl.user(m.id)} (${m.count})`, value: m.score! }))} format={(v) => f.number(v, { maximumFractionDigits: 1 })} />
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
            <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink"><Trophy className="h-4 w-4 text-warning" />{t('field.leaderboard')}</h3>
            <ol className="divide-y divide-line">{board.map((x, i) => (
              <li key={x.agent.id}><button type="button" onClick={() => setSelected(x.agent.id)} aria-pressed={pick?.agent.id === x.agent.id} className={cn('flex w-full items-center gap-3 px-2 py-2 text-left text-[14px]', pick?.agent.id === x.agent.id && 'bg-brand-soft')}>
                <span className="tnum w-6 text-muted">{i + 1}</span><span className="flex-1"><AgentName id={x.agent.id} /></span>
                <span className="h-2 w-24 overflow-hidden rounded-full bg-canvas" aria-hidden><span className="block h-full rounded-full bg-brand" style={{ width: `${x.s.total}%` }} /></span>
                <span className="tnum w-12 text-right font-semibold text-ink">{f.number(x.s.total, { maximumFractionDigits: 1 })}</span>
              </button></li>
            ))}</ol>
          </section>
          {pick && model && (
            <section className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-soft">
              <div className="flex items-baseline justify-between"><h3 className="text-[14px] font-semibold text-ink">{fl.agentName(pick.agent.id)}</h3><span className="tnum text-[24px] font-semibold text-ink">{f.number(pick.s.total, { maximumFractionDigits: 1 })}<span className="text-[14px] text-muted">{' / 100'}</span></span></div>
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[12px] text-label"><th className="py-1.5">{t('field.component')}</th><th className="py-1.5 text-right">{t('field.achieved')}</th><th className="py-1.5 text-right">{t('field.target')}</th><th className="py-1.5 text-right">{t('field.points')}</th></tr></thead>
                <tbody>{model.components.map((c) => { const p = pick.s.parts.find((x) => x.componentId === c.id); return (
                  <tr key={c.id} className="border-t border-line"><td className="py-1.5 text-ink">{fl.activity(c.metric)}</td><td className="tnum py-1.5 text-right">{f.number(p?.value ?? 0, { maximumFractionDigits: 0 })}</td><td className="tnum py-1.5 text-right text-muted">{f.number(c.target ?? 0)}</td><td className="tnum py-1.5 text-right font-medium">{`${f.number(p?.points ?? 0, { maximumFractionDigits: 1 })} / ${c.weight}`}</td></tr>
                ); })}</tbody>
              </table>
              <div><h4 className="mb-2 text-[13px] font-semibold text-ink">{t('field.trend')}</h4><Lines data={trend.map((x) => ({ label: f.date(`${x.month}-15`, 'MMM'), score: x.score }))} series={[{ key: 'score', label: t('field.score'), index: 0 }]} format={(v) => f.number(v, { maximumFractionDigits: 1 })} /></div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
