import { useMemo } from 'react';
import type { LandSettings, NurseryRoundDef, SpeciesType } from '@/types';
import { Checkbox } from '@/components/shared/Field';
import { uid } from '@/lib/utils';
import { useCurrentOrg, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { AddRow, ChipsInput, EditTable, Grid, LangInputs, Mini, NumberInput, RowDelete, Section, Select, SettingsFrame, TextInput } from '../kit';

const KEYS = ['land'] as const;
const TYPES: SpeciesType[] = ['FRUIT', 'TIMBER', 'SHEA_GRAFTED', 'SHEA_UNGRAFTED', 'SHADE', 'MEDICINAL'];
const ROUND_FIELDS: NurseryRoundDef['fields'] = ['polyBags', 'potted', 'germinated', 'alive', 'dead', 'newGerminations'];

/** Trees and land (PRD I1–I5): species, monitoring rounds, plot types, plot questionnaire, EUDR rules. */
export function TreesLandPage() {
  const d = useSettingsDraft('treesLand', KEYS);
  const org = useCurrentOrg();
  const { t } = useT();
  const langs = org.languages.length ? org.languages : [org.language];
  const s = d.value.land;
  const set = (patch: Partial<LandSettings>) => d.set('land', { ...s, ...patch });
  const at = <K extends 'species' | 'nurseryRounds' | 'plotTypes' | 'plotMonitoring'>(k: K, i: number, patch: Partial<LandSettings[K][number]>) =>
    set({ [k]: (s[k] as LandSettings[K][number][]).map((x, j) => (j === i ? { ...x, ...patch } : x)) } as Partial<LandSettings>);
  const drop = (k: 'species' | 'nurseryRounds' | 'plotTypes' | 'plotMonitoring', i: number) => set({ [k]: (s[k] as unknown[]).filter((_, j) => j !== i) } as Partial<LandSettings>);
  const errors = useMemo(() => {
    const out: string[] = [];
    const prefixes = s.species.map((x) => x.codePrefix.trim().toUpperCase());
    if (prefixes.some((p) => !p) || new Set(prefixes).size !== prefixes.length) out.push(t('set.land.errPrefix'));
    if (s.treeRoundDays.some((x, i) => i && x <= s.treeRoundDays[i - 1]!)) out.push(t('set.land.errRounds'));
    if (s.eudr.minDecimals < 5) out.push(t('set.land.errDecimals'));
    return out;
  }, [s, t]);
  const name = (x: { name: Partial<Record<string, string>> }) => x.name[org.language] ?? x.name.en ?? '';
  return (
    <SettingsFrame page="treesLand" {...bind(d)} errors={errors}>
      <Section title={t('set.land.species')} description={t('set.land.speciesHint')}>
        <EditTable head={[t('set.land.speciesName'), t('set.land.prefix'), t('set.land.type'), ...s.plotTypes.map((p) => t('set.land.densityFor', { type: name(p) })), t('set.land.co2'), t('set.land.enabled'), '']}>
          {s.species.map((x, i) => (
            <tr key={x.id}>
              <td className="min-w-[280px]"><LangInputs label={t('set.land.speciesName')} value={x.name} onChange={(v) => at('species', i, { name: v })} languages={langs} /></td>
              <td className="w-24 min-w-[96px]"><TextInput value={x.codePrefix} onChange={(v) => at('species', i, { codePrefix: v.toUpperCase().slice(0, 4) })} aria-label={t('set.land.prefix')} /></td>
              <td className="w-44 min-w-[176px]"><Select value={x.type} onChange={(type) => at('species', i, { type })} options={TYPES.map((v) => ({ value: v, label: t(`set.land.speciesType.${v}`) }))} aria-label={t('set.land.type')} /></td>
              {s.plotTypes.map((p) => <td key={p.id} className="w-32 min-w-[128px]"><NumberInput value={x.densityPerHa[p.id] ?? 0} min={0} suffix="/ha" onChange={(v) => at('species', i, { densityPerHa: { ...x.densityPerHa, [p.id]: v } })} aria-label={t('set.land.densityFor', { type: name(p) })} /></td>)}
              <td className="w-32 min-w-[128px]"><NumberInput value={x.co2KgPerYear} min={0} suffix="kg" onChange={(v) => at('species', i, { co2KgPerYear: v })} aria-label={t('set.land.co2')} /></td>
              <td className="w-16"><Checkbox label={<span className="sr-only">{t('set.land.enabled')}</span>} checked={x.enabled} onChange={(e) => at('species', i, { enabled: e.target.checked })} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => drop('species', i)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => set({ species: [...s.species, { id: uid('sp'), name: { [org.language]: t('set.land.newSpecies') }, codePrefix: 'NEW', type: 'FRUIT', densityPerHa: {}, co2KgPerYear: 10, enabled: true }] })}>{t('set.land.addSpecies')}</AddRow></div>
      </Section>

      <Section title={t('set.land.nurseryRounds')} description={t('set.land.nurseryRoundsHint')}>
        <EditTable head={[t('set.land.roundName'), t('set.land.kind'), t('set.land.dueDays'), t('set.land.fields'), '']}>
          {s.nurseryRounds.map((r, i) => (
            <tr key={r.id}>
              <td className="min-w-[260px]"><LangInputs label={t('set.land.roundName')} value={r.name} onChange={(v) => at('nurseryRounds', i, { name: v })} languages={langs} /></td>
              <td className="w-36"><Select value={r.kind} onChange={(kind) => at('nurseryRounds', i, { kind })} options={(['PRIMARY', 'SECONDARY'] as const).map((k) => ({ value: k, label: t(`set.land.roundKind.${k}`) }))} aria-label={t('set.land.kind')} /></td>
              <td className="w-32"><NumberInput value={r.dueDays} min={1} suffix={t('set.sales.daysUnit')} onChange={(v) => at('nurseryRounds', i, { dueDays: v })} aria-label={t('set.land.dueDays')} /></td>
              <td><div className="flex flex-wrap gap-1.5">{ROUND_FIELDS.map((fld) => <button key={fld} type="button" aria-pressed={r.fields.includes(fld)} onClick={() => at('nurseryRounds', i, { fields: r.fields.includes(fld) ? r.fields.filter((x) => x !== fld) : [...r.fields, fld] })} className={r.fields.includes(fld) ? 'rounded-chip border border-brand bg-brand-soft px-2.5 py-1 text-[12px] text-ink' : 'rounded-chip border border-line px-2.5 py-1 text-[12px] text-muted'}>{t(`land.${fld}`)}</button>)}</div></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => drop('nurseryRounds', i)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => set({ nurseryRounds: [...s.nurseryRounds, { id: uid('nr'), name: { [org.language]: t('set.land.roundKind.SECONDARY') }, kind: 'SECONDARY', dueDays: (s.nurseryRounds.at(-1)?.dueDays ?? 30) + 30, fields: ['alive', 'dead', 'newGerminations'] }] })}>{t('set.land.addRound')}</AddRow></div>
      </Section>

      <Section title={t('set.land.trees')} description={t('set.land.treesHint')}>
        <Grid cols={3}>
          <Mini label={t('set.land.treeRounds')}><ChipsInput values={s.treeRoundDays.map(String)} onChange={(v) => set({ treeRoundDays: v.map(Number).filter((n) => n > 0) })} label={t('set.land.treeRounds')} placeholder={t('set.land.treeRoundsPlaceholder')} /></Mini>
          <Mini label={t('set.land.maxPerFarmer')}><NumberInput value={s.maxSeedlingsPerFarmer} min={1} onChange={(v) => set({ maxSeedlingsPerFarmer: v })} aria-label={t('set.land.maxPerFarmer')} /></Mini>
          <Mini label={t('set.land.exportMax')}><NumberInput value={s.exportMaxDays} min={1} suffix={t('set.sales.daysUnit')} onChange={(v) => set({ exportMaxDays: v })} aria-label={t('set.land.exportMax')} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.land.plotTypes')} description={t('set.land.plotTypesHint')}>
        <EditTable head={[t('set.land.plotTypeName'), t('set.land.requiresFarmer'), '']} className="[&_table]:min-w-0">
          {s.plotTypes.map((p, i) => (
            <tr key={p.id}>
              <td><LangInputs label={t('set.land.plotTypeName')} value={p.name} onChange={(v) => at('plotTypes', i, { name: v })} languages={langs} /></td>
              <td className="w-40"><Checkbox label={<span className="sr-only">{t('set.land.requiresFarmer')}</span>} checked={p.requiresFarmer} onChange={(e) => at('plotTypes', i, { requiresFarmer: e.target.checked })} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => drop('plotTypes', i)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => set({ plotTypes: [...s.plotTypes, { id: uid('pt'), name: { [org.language]: t('set.land.newPlotType') }, requiresFarmer: false }] })}>{t('set.land.addPlotType')}</AddRow></div>
      </Section>

      <Section title={t('set.land.plotMonitoring')} description={t('set.land.plotMonitoringHint')}>
        <EditTable head={[t('set.land.question'), t('set.land.answer'), t('set.land.forTypes'), '']}>
          {s.plotMonitoring.map((q, i) => (
            <tr key={q.id}>
              <td className="min-w-[300px]"><LangInputs label={t('set.land.question')} value={q.label} onChange={(v) => at('plotMonitoring', i, { label: v })} languages={langs} /></td>
              <td className="w-32"><Select value={q.kind} onChange={(kind) => at('plotMonitoring', i, { kind })} options={(['YES_NO', 'TEXT'] as const).map((k) => ({ value: k, label: t(`set.land.answerKind.${k}`) }))} aria-label={t('set.land.answer')} /></td>
              <td><div className="flex flex-wrap gap-1.5">{s.plotTypes.map((p) => <button key={p.id} type="button" aria-pressed={q.plotTypeIds.includes(p.id)} onClick={() => at('plotMonitoring', i, { plotTypeIds: q.plotTypeIds.includes(p.id) ? q.plotTypeIds.filter((x) => x !== p.id) : [...q.plotTypeIds, p.id] })} className={q.plotTypeIds.includes(p.id) ? 'rounded-chip border border-brand bg-brand-soft px-2.5 py-1 text-[12px] text-ink' : 'rounded-chip border border-line px-2.5 py-1 text-[12px] text-muted'}>{name(p)}</button>)}</div></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => drop('plotMonitoring', i)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <AddRow onClick={() => set({ plotMonitoring: [...s.plotMonitoring, { id: uid('pq'), label: { [org.language]: t('set.land.newQuestion') }, kind: 'YES_NO', plotTypeIds: s.plotTypes.map((p) => p.id) }] })}>{t('set.land.addQuestion')}</AddRow>
          <Mini label={t('set.land.monitoringEvery')} className="w-44"><NumberInput value={s.plotMonitoringDays} min={7} suffix={t('set.sales.daysUnit')} onChange={(v) => set({ plotMonitoringDays: v })} aria-label={t('set.land.monitoringEvery')} /></Mini>
        </div>
      </Section>

      <Section title={t('set.land.eudr')} description={t('set.land.eudrHint')}>
        <Grid cols={3}>
          <Mini label={t('set.land.cutoff')}><TextInput type="date" value={s.eudr.cutoffDate} onChange={(v) => set({ eudr: { ...s.eudr, cutoffDate: v } })} aria-label={t('set.land.cutoff')} /></Mini>
          <Mini label={t('set.land.polygonOver')}><NumberInput value={s.eudr.polygonOverHa} min={0} step={0.5} suffix="ha" onChange={(v) => set({ eudr: { ...s.eudr, polygonOverHa: v } })} aria-label={t('set.land.polygonOver')} /></Mini>
          <Mini label={t('set.land.minDecimals')}><NumberInput value={s.eudr.minDecimals} min={4} max={8} onChange={(v) => set({ eudr: { ...s.eudr, minDecimals: v } })} aria-label={t('set.land.minDecimals')} /></Mini>
          <Mini label={t('set.land.operatorName')}><TextInput value={s.eudr.operator.name} onChange={(v) => set({ eudr: { ...s.eudr, operator: { ...s.eudr.operator, name: v } } })} aria-label={t('set.land.operatorName')} /></Mini>
          <Mini label={t('set.land.eori')}><TextInput value={s.eudr.operator.eori} onChange={(v) => set({ eudr: { ...s.eudr, operator: { ...s.eudr.operator, eori: v } } })} aria-label={t('set.land.eori')} /></Mini>
          <Mini label={t('set.land.address')}><TextInput value={s.eudr.operator.address} onChange={(v) => set({ eudr: { ...s.eudr, operator: { ...s.eudr.operator, address: v } } })} aria-label={t('set.land.address')} /></Mini>
        </Grid>
        <p className="mt-4 text-[13px] text-muted">{t('set.land.eudrRelevantHint')}</p>
      </Section>
    </SettingsFrame>
  );
}
