import { useMemo } from 'react';
import type { ImpactKpi, SalesSettings } from '@/types';
import { Checkbox } from '@/components/shared/Field';
import { uid } from '@/lib/utils';
import { useCurrentOrg, useLang, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { AddRow, ChipsInput, EditTable, Grid, LangInputs, Mini, NumberInput, RowDelete, Section, Select, SettingsFrame, TextInput } from '../kit';

const SALES_KEYS = ['sales', 'commodities'] as const;
const KPIS: ImpactKpi[] = ['womenShare', 'childrenPerFarmer', 'treesPlanted', 'plotsMapped', 'eudr'];
const TRIGGERS = ['SIGNATURE', 'DELIVERY', 'AFTER_DELIVERY'] as const;

/** Sales rules (PRD H6–H8): payment terms, packaging, contract templates and what buyers see. */
export function SalesRulesPage() {
  const d = useSettingsDraft('salesRules', SALES_KEYS);
  const org = useCurrentOrg();
  const lang = useLang();
  const { t } = useT();
  const langs = org.languages.length ? org.languages : [org.language];
  const s = d.value.sales;
  const set = (patch: Partial<SalesSettings>) => d.set('sales', { ...s, ...patch });
  const name = (x: { name: Partial<Record<string, string>> }) => x.name[lang] ?? x.name.en ?? '';
  const errors = useMemo(() => {
    const out: string[] = [];
    if (s.paymentTerms.some((p) => p.instalments.reduce((a, i) => a + i.pct, 0) !== 100)) out.push(t('set.sales.errPct'));
    if (s.templates.some((x) => !s.paymentTerms.some((p) => p.id === x.paymentTermId) || !s.packaging.some((p) => p.id === x.packagingId))) out.push(t('set.sales.errTemplate'));
    return out;
  }, [s, t]);
  const setTerm = (i: number, patch: Partial<SalesSettings['paymentTerms'][number]>) => set({ paymentTerms: s.paymentTerms.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setTemplate = (i: number, patch: Partial<SalesSettings['templates'][number]>) => set({ templates: s.templates.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <SettingsFrame page="salesRules" {...bind(d)} errors={errors}>
      <Section title={t('set.sales.terms')} description={t('set.sales.termsHint')}>
        <div className="space-y-3">
          {s.paymentTerms.map((p, i) => (
            <div key={p.id} className="rounded-ctl border border-line p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1"><LangInputs label={t('set.sales.termName')} value={p.name} onChange={(v) => setTerm(i, { name: v })} languages={langs} /></div>
                <RowDelete label={t('set.remove')} onClick={() => set({ paymentTerms: s.paymentTerms.filter((_, j) => j !== i) })} />
              </div>
              <EditTable head={[t('set.sales.pct'), t('set.sales.trigger'), t('set.sales.days'), '']} className="mt-3 [&_table]:min-w-0">
                {p.instalments.map((x, k) => (
                  <tr key={k}>
                    <td className="w-40"><NumberInput value={x.pct} min={0} max={100} suffix="%" onChange={(pct) => setTerm(i, { instalments: p.instalments.map((y, m) => (m === k ? { ...y, pct } : y)) })} aria-label={t('set.sales.pct')} /></td>
                    <td><Select value={x.trigger} onChange={(trigger) => setTerm(i, { instalments: p.instalments.map((y, m) => (m === k ? { ...y, trigger } : y)) })} options={TRIGGERS.map((v) => ({ value: v, label: t(`sales.trigger.${v}`) }))} aria-label={t('set.sales.trigger')} /></td>
                    <td className="w-40"><NumberInput value={x.days} min={0} suffix={t('set.sales.daysUnit')} onChange={(days) => setTerm(i, { instalments: p.instalments.map((y, m) => (m === k ? { ...y, days } : y)) })} aria-label={t('set.sales.days')} /></td>
                    <td className="w-12">{p.instalments.length > 1 && <RowDelete label={t('set.remove')} onClick={() => setTerm(i, { instalments: p.instalments.filter((_, m) => m !== k) })} />}</td>
                  </tr>
                ))}
              </EditTable>
              <div className="mt-2 flex items-center justify-between">
                <AddRow onClick={() => setTerm(i, { instalments: [...p.instalments, { pct: 0, trigger: 'DELIVERY', days: 0 }] })}>{t('set.sales.addInstalment')}</AddRow>
                <span className="text-[13px] text-muted">{t('set.sales.totalPct', { pct: p.instalments.reduce((a, x) => a + x.pct, 0) })}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3"><AddRow onClick={() => set({ paymentTerms: [...s.paymentTerms, { id: uid('pt'), name: { [org.language]: t('set.sales.newTerm') }, instalments: [{ pct: 100, trigger: 'DELIVERY', days: 0 }] }] })}>{t('set.sales.addTerm')}</AddRow></div>
      </Section>

      <Section title={t('set.sales.packaging')} description={t('set.sales.packagingHint')}>
        <EditTable head={[t('set.sales.packagingName'), '']} className="[&_table]:min-w-0">
          {s.packaging.map((p, i) => (
            <tr key={p.id}>
              <td><LangInputs label={t('set.sales.packagingName')} value={p.name} onChange={(v) => set({ packaging: s.packaging.map((y, j) => (j === i ? { ...y, name: v } : y)) })} languages={langs} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => set({ packaging: s.packaging.filter((_, j) => j !== i) })} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => set({ packaging: [...s.packaging, { id: uid('pk'), name: { [org.language]: t('set.sales.newPackaging') } }] })}>{t('set.sales.addPackaging')}</AddRow></div>
      </Section>

      <Section title={t('set.sales.templates')} description={t('set.sales.templatesHint')}>
        <div className="space-y-3">
          {s.templates.map((x, i) => (
            <div key={x.id} className="rounded-ctl border border-line p-4">
              <div className="flex items-start gap-3">
                <Grid cols={3} className="flex-1">
                  <Mini label={t('set.sales.templateName')}><TextInput value={x.name} onChange={(v) => setTemplate(i, { name: v })} aria-label={t('set.sales.templateName')} /></Mini>
                  <Mini label={t('set.units.commodity')}><Select value={x.commodityId} onChange={(commodityId) => setTemplate(i, { commodityId })} options={d.value.commodities.map((c) => ({ value: c.id, label: c.name[lang] ?? c.name.en ?? c.code }))} aria-label={t('set.units.commodity')} /></Mini>
                  <Mini label={t('set.sales.unit')}><Select value={x.unitId} onChange={(unitId) => setTemplate(i, { unitId })} options={['t', 'kg', 'bag'].map((u) => ({ value: u, label: u }))} aria-label={t('set.sales.unit')} /></Mini>
                  <Mini label={t('sales.paymentTerms')}><Select value={x.paymentTermId} onChange={(paymentTermId) => setTemplate(i, { paymentTermId })} options={s.paymentTerms.map((p) => ({ value: p.id, label: name(p) }))} aria-label={t('sales.paymentTerms')} /></Mini>
                  <Mini label={t('sales.packaging')}><Select value={x.packagingId} onChange={(packagingId) => setTemplate(i, { packagingId })} options={s.packaging.map((p) => ({ value: p.id, label: name(p) }))} aria-label={t('sales.packaging')} /></Mini>
                  <Mini label={t('sales.tolerancePct')}><NumberInput value={x.tolerancePct} min={0} max={20} step={0.5} suffix="%" onChange={(tolerancePct) => setTemplate(i, { tolerancePct })} aria-label={t('sales.tolerancePct')} /></Mini>
                  <Mini label={t('sales.deliveryPoint')} className="sm:col-span-3"><TextInput value={x.deliveryPoint} onChange={(v) => setTemplate(i, { deliveryPoint: v })} aria-label={t('sales.deliveryPoint')} /></Mini>
                </Grid>
                <RowDelete label={t('set.remove')} onClick={() => set({ templates: s.templates.filter((_, j) => j !== i) })} />
              </div>
              <Mini label={t('sales.clauses')} className="mt-3">
                <textarea value={x.clauses} onChange={(e) => setTemplate(i, { clauses: e.target.value })} rows={3} aria-label={t('sales.clauses')} className="w-full rounded-ctl border border-line bg-surface px-3 py-2 text-[14px] text-ink" />
              </Mini>
            </div>
          ))}
        </div>
        <div className="mt-3"><AddRow onClick={() => set({ templates: [...s.templates, { id: uid('ct'), name: t('set.sales.newTemplate'), commodityId: d.value.commodities[0]?.id ?? '', unitId: 't', paymentTermId: s.paymentTerms[0]?.id ?? '', packagingId: s.packaging[0]?.id ?? '', tolerancePct: 2, deliveryPoint: '', clauses: '' }] })}>{t('set.sales.addTemplate')}</AddRow></div>
      </Section>

      <Section title={t('set.sales.buyers')} description={t('set.sales.buyersHint')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {KPIS.map((k) => (
            <div key={k} className="rounded-ctl border border-line px-3 py-2.5">
              <Checkbox label={t(`set.sales.kpi.${k}`)} description={t(`set.sales.kpiHint.${k}`)} checked={s.impactKpis.includes(k)} onChange={(e) => set({ impactKpis: e.target.checked ? KPIS.filter((x) => x === k || s.impactKpis.includes(x)) : s.impactKpis.filter((x) => x !== k) })} />
            </div>
          ))}
        </div>
        <div className="mt-4"><Mini label={t('set.sales.certifications')}><ChipsInput values={s.certifications} onChange={(certifications) => set({ certifications })} label={t('set.sales.certifications')} placeholder={t('set.sales.certPlaceholder')} /></Mini></div>
        <Grid cols={3} className="mt-4">
          <Mini label={t('set.sales.overdueDays')}><NumberInput value={s.overdueAlertDays} min={0} suffix={t('set.sales.daysUnit')} onChange={(overdueAlertDays) => set({ overdueAlertDays })} aria-label={t('set.sales.overdueDays')} /></Mini>
        </Grid>
      </Section>
    </SettingsFrame>
  );
}
