import type { AgentType, FieldActivity, FieldTeamSettings } from '@/types';
import type { RateCard } from '@/engines/rates';
import type { ScoreModel } from '@/engines/scoring';
import { Switch } from '@/components/ui/switch';
import { uid } from '@/lib/utils';
import { useCurrentOrg, useT } from '@/stores/hooks';
import { AddRow, EditTable, Grid, LangInputs, Mini, MoneyInput, NumberInput, RowDelete, Rows, Section, Select, SwitchRow, TextInput } from '../kit';

const SOURCES: FieldActivity['metric']['source'][] = ['farmers', 'communities', 'groups', 'purchases', 'responses', 'workshops', 'attendance', 'treeVisits', 'plots', 'seedlings', 'nurseryRounds', 'repayments', 'manual'];

/** Score card weights must total 100 for each agent type. */
export const scoreErrors = (ft: FieldTeamSettings) => ft.scoreModels.filter((m) => Math.round(m.components.reduce((s, c) => s + c.weight, 0)) !== 100).map((m) => m.agentTypeId ?? m.id);

/**
 * Settings → Field team, field-team phase (PRD J2, J7–J11): activity catalogue with metric definitions,
 * commission rate cards, agent score cards, budget and geofence rules.
 */
export function FieldTeamExtras({ ft, setFt, agentTypes }: { ft: FieldTeamSettings; setFt: (p: Partial<FieldTeamSettings>) => void; agentTypes: AgentType[] }) {
  const { t } = useT();
  const org = useCurrentOrg();
  const langs = org.languages.length ? org.languages : [org.language];
  const typeName = (id: string) => { const x = agentTypes.find((a) => a.id === id); return x ? x.name[org.language] ?? x.name.en ?? x.code : id; };
  const actName = (id: string) => { const a = ft.activities.find((x) => x.id === id); return a ? a.name[org.language] ?? a.name.en ?? id : id; };
  const editAct = (id: string, patch: Partial<FieldActivity>) => setFt({ activities: ft.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const editCard = (id: string, patch: Partial<RateCard>) => setFt({ rateCards: ft.rateCards.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const editModel = (id: string, fn: (m: ScoreModel) => ScoreModel) => setFt({ scoreModels: ft.scoreModels.map((m) => (m.id === id ? fn(m) : m)) });
  const actOptions = ft.activities.map((a) => ({ value: a.id, label: actName(a.id) }));
  return (
    <>
      <Section title={t('set.field.activities')} description={t('set.field.activitiesHint', { count: ft.activities.length })}>
        <EditTable head={[t('set.field.activityName'), t('set.field.unit'), t('set.field.source'), t('set.field.attribution'), t('set.field.needsCommunity'), t('set.field.active'), '']}>
          {ft.activities.map((a) => (
            <tr key={a.id}>
              <td className="min-w-[260px]"><LangInputs label={t('set.field.activityName')} value={a.name} onChange={(name) => editAct(a.id, { name })} languages={langs} /></td>
              <td className="w-28"><TextInput value={a.unit} onChange={(unit) => editAct(a.id, { unit })} aria-label={t('set.field.unit')} /></td>
              <td className="w-44"><Select value={a.metric.source} onChange={(source) => editAct(a.id, { metric: { ...a.metric, source, aggregate: source === 'manual' ? 'sum' : a.metric.aggregate } })} options={SOURCES.map((x) => ({ value: x, label: t(`field.source.${x}`) }))} aria-label={t('set.field.source')} /></td>
              <td className="w-44"><Select value={a.metric.attribution} onChange={(attribution) => editAct(a.id, { metric: { ...a.metric, attribution } })} options={(['plannedCommunities', 'anywhere'] as const).map((x) => ({ value: x, label: t(`field.attrib.${x}`) }))} aria-label={t('set.field.attribution')} /></td>
              <td className="w-24"><Switch checked={a.needsCommunity} onCheckedChange={(needsCommunity) => editAct(a.id, { needsCommunity })} aria-label={t('set.field.needsCommunity')} /></td>
              <td className="w-20"><Switch checked={a.active} onCheckedChange={(active) => editAct(a.id, { active })} aria-label={t('set.field.active')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => setFt({ activities: ft.activities.filter((x) => x.id !== a.id) })} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => setFt({ activities: [...ft.activities, { id: uid('act'), name: { [org.language]: t('set.field.newActivity') }, unit: 'visits', needsCommunity: true, metric: { source: 'manual', aggregate: 'sum', attribution: 'anywhere' }, active: true }] })}>{t('set.field.addActivity')}</AddRow></div>
      </Section>

      <Section title={t('set.field.rateCards')} description={t('set.field.rateCardsHint')}>
        <EditTable head={[t('set.field.agentType'), t('set.field.activity'), t('set.field.per'), t('set.field.rate'), t('set.field.minToQualify'), t('set.field.effectiveFrom'), '']}>
          {ft.rateCards.map((c) => (
            <tr key={c.id}>
              <td className="w-48"><Select value={c.agentTypeId} onChange={(agentTypeId) => editCard(c.id, { agentTypeId })} options={agentTypes.map((a) => ({ value: a.id, label: typeName(a.id) }))} aria-label={t('set.field.agentType')} /></td>
              <td className="min-w-[200px]"><Select value={c.metricKey} onChange={(metricKey) => editCard(c.id, { metricKey })} options={actOptions} aria-label={t('set.field.activity')} /></td>
              <td className="w-32"><NumberInput value={c.per} min={1} suffix={c.unit} onChange={(per) => editCard(c.id, { per })} aria-label={t('set.field.per')} /></td>
              <td className="w-40"><MoneyInput minor={c.rate.amountMinor} currency={c.rate.currency} onChange={(amountMinor) => editCard(c.id, { rate: { ...c.rate, amountMinor } })} aria-label={t('set.field.rate')} /></td>
              <td className="w-32"><NumberInput value={c.eligibility.find((e) => e.kind === 'minValue')?.value ?? 0} min={0} onChange={(v) => editCard(c.id, { eligibility: v > 0 ? [{ kind: 'minValue', value: v, noteKey: 'comm.note.minValue' }] : [] })} aria-label={t('set.field.minToQualify')} /></td>
              <td className="w-40"><TextInput type="date" value={c.effectiveFrom} onChange={(effectiveFrom) => editCard(c.id, { effectiveFrom })} aria-label={t('set.field.effectiveFrom')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => setFt({ rateCards: ft.rateCards.filter((x) => x.id !== c.id) })} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => setFt({ rateCards: [...ft.rateCards, { id: uid('rc'), agentTypeId: agentTypes[0]?.id ?? '', metricKey: ft.activities[0]?.id ?? '', per: 1, unit: ft.activities[0]?.unit ?? '', rate: { amountMinor: 0, currency: org.currency }, eligibility: [], effectiveFrom: new Date().toISOString().slice(0, 10) }] })}>{t('set.field.addRateCard')}</AddRow></div>
        <p className="mt-3 text-[13px] text-muted">{t('set.field.workshopRule')}</p>
      </Section>

      <Section title={t('set.field.scoreCards')} description={t('set.field.scoreCardsHint')}>
        <div className="space-y-4">
          {ft.scoreModels.map((m) => {
            const total = m.components.reduce((s, c) => s + c.weight, 0);
            return (
              <div key={m.id} className="rounded-card border border-line p-3">
                <div className="mb-2 flex items-center justify-between"><span className="font-medium text-ink">{typeName(m.agentTypeId ?? '')}</span><span className={total === 100 ? 'text-[13px] text-muted' : 'text-[13px] font-semibold text-danger'}>{t('set.field.weightsTotal', { n: total })}</span></div>
                <EditTable head={[t('set.field.activity'), t('set.field.target'), t('set.field.weight'), '']} className="[&_table]:min-w-0">
                  {m.components.map((c, i) => (
                    <tr key={c.id}>
                      <td><Select value={c.metric} onChange={(metric) => editModel(m.id, (x) => ({ ...x, components: x.components.map((y, j) => (j === i ? { ...y, metric, id: metric, name: metric } : y)) }))} options={actOptions} aria-label={t('set.field.activity')} /></td>
                      <td className="w-36"><NumberInput value={c.target ?? 0} min={1} onChange={(target) => editModel(m.id, (x) => ({ ...x, components: x.components.map((y, j) => (j === i ? { ...y, target } : y)) }))} aria-label={t('set.field.target')} /></td>
                      <td className="w-28"><NumberInput value={c.weight} min={0} max={100} onChange={(weight) => editModel(m.id, (x) => ({ ...x, components: x.components.map((y, j) => (j === i ? { ...y, weight } : y)) }))} aria-label={t('set.field.weight')} /></td>
                      <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => editModel(m.id, (x) => ({ ...x, components: x.components.filter((_, j) => j !== i) }))} /></td>
                    </tr>
                  ))}
                </EditTable>
                <div className="mt-2"><AddRow onClick={() => editModel(m.id, (x) => ({ ...x, components: [...x.components, { id: ft.activities[0]?.id ?? uid('c'), name: ft.activities[0]?.id ?? '', metric: ft.activities[0]?.id ?? '', rule: 'linear-to-target', target: 100, weight: 0 }] }))}>{t('set.field.addComponent')}</AddRow></div>
              </div>
            );
          })}
          {agentTypes.filter((a) => !ft.scoreModels.some((m) => m.agentTypeId === a.id) && a.mobileTiles.some((x) => x !== 'warehouse')).length > 0 && (
            <AddRow onClick={() => { const a = agentTypes.find((x) => !ft.scoreModels.some((m) => m.agentTypeId === x.id))!; setFt({ scoreModels: [...ft.scoreModels, { id: uid('sm'), entity: 'agent', agentTypeId: a.id, period: 'year', version: 1, components: [] }] }); }}>{t('set.field.addScoreCard')}</AddRow>
          )}
        </div>
        <Grid cols={2} className="mt-4">
          <Mini label={t('set.field.managerScore')}><Select value={ft.managerScore} onChange={(managerScore) => setFt({ managerScore })} options={(['BY_AGENTS', 'EQUAL'] as const).map((x) => ({ value: x, label: t(`field.managerScoreHow.${x}`) }))} aria-label={t('set.field.managerScore')} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.field.budgetRules')}>
        <Rows>
          <SwitchRow label={t('set.field.retirementBlocks')} description={t('set.field.retirementBlocksHint')} checked={ft.retirementBlocksBudget} onChange={(retirementBlocksBudget) => setFt({ retirementBlocksBudget })} />
        </Rows>
        <Grid cols={2} className="mt-4">
          <Mini label={t('set.field.geofenceKm')}><NumberInput value={ft.geofenceKm} min={0.5} step={0.5} suffix="km" onChange={(geofenceKm) => setFt({ geofenceKm })} aria-label={t('set.field.geofenceKm')} /></Mini>
        </Grid>
      </Section>
    </>
  );
}
