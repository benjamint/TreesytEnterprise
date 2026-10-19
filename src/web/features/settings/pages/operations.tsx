import { useMemo, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type { BuyingRules, Commodity, InventoryRules, MovementType, PackagingProfile, PriceListEntry, Unit } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/shared/Field';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { COMMODITY_LIBRARY } from '@/data/templates/companyTemplates';
import { convert } from '@/engines/units';
import { cn, uid } from '@/lib/utils';
import { useCurrentOrg, useFormat, useLang, useOrgSettings, useT } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';
import { bind, useSettingsDraft } from '../draft';
import {
  AddRow, ChipsInput, EditTable, Grid, LangInputs, Mini, MoneyInput, NumberInput, RowDelete, Rows, Section, Segmented, Select, SettingsFrame, SwitchRow, TextInput,
} from '../kit';

const commodityName = (c: Commodity, lang: 'en' | 'fr') => c.name[lang] ?? c.name.en ?? c.code;

// ---------------------------------------------------------------- Commodities

const COMMODITY_KEYS = ['commodities', 'packaging', 'priceList', 'inventoryRules', 'buyingRules'] as const;

export function CommoditiesPage() {
  const d = useSettingsDraft('commodities', COMMODITY_KEYS);
  const { commodities } = d.value;
  const org = useCurrentOrg();
  const lang = useLang();
  const { t } = useT();
  const [selected, setSelected] = useState(commodities[0]?.id ?? '');
  const c = commodities.find((x) => x.id === selected) ?? commodities[0];
  const setC = (patch: Partial<Commodity>) => d.set('commodities', commodities.map((x) => (x.id === c!.id ? { ...x, ...patch } : x)));
  const massUnits = ['kg', 't', 'g', 'lb', 'bag'];

  const add = (from?: Commodity) => {
    const id = from && !commodities.some((x) => x.id === from.id) ? from.id : uid('com');
    const base: Commodity = from
      ? { ...from, id }
      : { id, code: 'NEW', name: { en: t('set.commodities.newName') }, aliases: [], hsCode: '', defaultUnitId: 'kg', allowedUnitIds: ['kg', 'bag'], quality: [], grades: ['A'], aggregatorThresholdKg: 2000, farmerMaxKg: 2000, eudrRelevant: false, lossTolerancePct: 0.5, color: '#93A39B', inScoring: true };
    d.set('commodities', [...commodities, base]);
    d.set('inventoryRules', (r) => ({ ...r, tolerances: [...r.tolerances, ...(['INBOUND', 'TRANSFER', 'STORAGE'] as MovementType[]).map((m) => ({ commodityId: id, movement: m, pct: base.lossTolerancePct }))] }));
    d.set('buyingRules', (r) => ({ ...r, sourcingModels: { ...r.sourcingModels, [id]: ['CASH_ADVANCE'] } }));
    setSelected(id);
  };
  const remove = (id: string) => {
    d.set('commodities', commodities.filter((x) => x.id !== id));
    d.set('packaging', (p) => p.filter((x) => x.commodityId !== id));
    d.set('priceList', (p) => p.filter((x) => x.commodityId !== id));
    d.set('inventoryRules', (r) => ({ ...r, tolerances: r.tolerances.filter((x) => x.commodityId !== id) }));
    setSelected(commodities.find((x) => x.id !== id)?.id ?? '');
  };

  const errors: string[] = [];
  const codes = commodities.map((x) => x.code);
  if (new Set(codes).size !== codes.length) errors.push(t('set.commodities.errCodeDup'));
  if (commodities.some((x) => !x.code.trim())) errors.push(t('set.commodities.errCode'));
  const library = COMMODITY_LIBRARY.filter((x) => !commodities.some((y) => y.id === x.id));

  return (
    <SettingsFrame page="commodities" {...bind(d)} errors={errors}>
      <div className="flex flex-wrap items-center gap-2">
        {commodities.map((x) => (
          <button key={x.id} type="button" onClick={() => setSelected(x.id)} className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[14px] font-medium', x.id === c?.id ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink hover:border-brand/40')}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} /> {commodityName(x, lang)}
            <span className="font-mono text-[11px] text-muted">{x.code}</span>
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm"><Plus /> {t('set.commodities.add')}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => add()}>{t('set.commodities.blank')}</DropdownMenuItem>
            {library.length > 0 && <DropdownMenuSeparator />}
            {library.map((x) => (
              <DropdownMenuItem key={x.id} onSelect={() => add(x)}>{commodityName(x, lang)}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {c ? (
        <>
          <Section title={t('set.commodities.basics')} actions={<RowDelete label={t('set.commodities.remove', { name: commodityName(c, lang) })} onClick={() => remove(c.id)} />}>
            <Grid>
              <Mini label={t('set.commodities.name')} className="md:col-span-2"><LangInputs label={t('set.commodities.name')} value={c.name} onChange={(name) => setC({ name })} languages={org.languages.length ? org.languages : [org.language]} /></Mini>
              <Mini label={t('set.commodities.code')}><TextInput value={c.code} maxLength={6} className="font-mono uppercase" onChange={(x) => setC({ code: x.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Mini>
              <Mini label={t('set.commodities.hs')}><TextInput value={c.hsCode} onChange={(x) => setC({ hsCode: x })} className="font-mono" /></Mini>
              <Mini label={t('set.commodities.aliases')} className="md:col-span-2"><ChipsInput label={t('set.commodities.aliases')} values={c.aliases} onChange={(aliases) => setC({ aliases })} placeholder={t('set.commodities.aliasesHint')} /></Mini>
              <Mini label={t('set.commodities.defaultUnit')}>
                <Select value={c.defaultUnitId} onChange={(x) => setC({ defaultUnitId: x, allowedUnitIds: [...new Set([...c.allowedUnitIds, x])] })} options={massUnits.map((u) => ({ value: u, label: t(`set.unit.${u}`) }))} />
              </Mini>
              <Mini label={t('set.commodities.allowedUnits')}>
                <div className="flex h-11 flex-wrap items-center gap-4">
                  {massUnits.map((u) => (
                    <Checkbox key={u} label={u} checked={c.allowedUnitIds.includes(u)} disabled={u === c.defaultUnitId} onChange={(e) => setC({ allowedUnitIds: e.target.checked ? [...c.allowedUnitIds, u] : c.allowedUnitIds.filter((x) => x !== u) })} />
                  ))}
                </div>
              </Mini>
            </Grid>
          </Section>

          <Section title={t('set.commodities.quality')} description={t('set.commodities.qualityHint')}>
            <EditTable head={[t('set.commodities.param'), t('set.commodities.min'), t('set.commodities.max'), t('set.commodities.unit'), '']}>
              {c.quality.map((q, i) => {
                const setQ = (patch: Partial<typeof q>) => setC({ quality: c.quality.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <tr key={i}>
                    <td><TextInput value={q.label} onChange={(label) => setQ({ label, key: label.toLowerCase().replace(/\W+/g, '') || q.key })} aria-label={t('set.commodities.param')} /></td>
                    <td className="w-32"><NumberInput value={q.min ?? 0} onChange={(min) => setQ({ min })} aria-label={t('set.commodities.min')} /></td>
                    <td className="w-32"><NumberInput value={q.max ?? 0} onChange={(max) => setQ({ max })} aria-label={t('set.commodities.max')} /></td>
                    <td className="w-28"><TextInput value={q.unit} onChange={(unit) => setQ({ unit })} aria-label={t('set.commodities.unit')} /></td>
                    <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => setC({ quality: c.quality.filter((_, j) => j !== i) })} /></td>
                  </tr>
                );
              })}
            </EditTable>
            <div className="mt-3"><AddRow onClick={() => setC({ quality: [...c.quality, { key: `p${c.quality.length + 1}`, label: '', max: 0, unit: '%' }] })}>{t('set.commodities.addParam')}</AddRow></div>
          </Section>

          <Section title={t('set.commodities.thresholds')}>
            <Grid cols={3}>
              <Mini label={t('set.commodities.grades')} className="md:col-span-3"><ChipsInput label={t('set.commodities.grades')} values={c.grades} onChange={(grades) => setC({ grades })} /></Mini>
              <Mini label={t('set.commodities.aggThreshold')}><NumberInput value={c.aggregatorThresholdKg} min={0} suffix="kg" onChange={(v) => setC({ aggregatorThresholdKg: v })} /></Mini>
              <Mini label={t('set.commodities.farmerMax')}><NumberInput value={c.farmerMaxKg} min={0} suffix="kg" onChange={(v) => setC({ farmerMaxKg: v })} /></Mini>
              <Mini label={t('set.commodities.color')}>
                <div className="flex items-center gap-2">
                  <input type="color" value={c.color} onChange={(e) => setC({ color: e.target.value })} aria-label={t('set.commodities.color')} className="h-11 w-12 cursor-pointer rounded-ctl border border-line bg-surface p-1" />
                  <TextInput value={c.color} onChange={(color) => setC({ color })} className="font-mono" />
                </div>
              </Mini>
            </Grid>
            <div className="mt-5">
              <Rows>
                <SwitchRow label={t('set.commodities.eudr')} description={t('set.commodities.eudrHint')} checked={c.eudrRelevant} onChange={(v) => setC({ eudrRelevant: v })} />
                <SwitchRow label={t('set.commodities.scoring')} description={t('set.commodities.scoringHint')} checked={c.inScoring ?? true} onChange={(v) => setC({ inScoring: v })} />
              </Rows>
            </div>
          </Section>
        </>
      ) : (
        <p className="text-muted">{t('set.commodities.none')}</p>
      )}
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Units & packaging

const UNIT_KEYS = ['units', 'packaging', 'landUnitId'] as const;

export function UnitsPage() {
  const d = useSettingsDraft('units', UNIT_KEYS);
  const { units, packaging, landUnitId } = d.value;
  const settingsCommodities = useCommodities();
  const lang = useLang();
  const { t } = useT();
  const f = useFormat();
  const [qty, setQty] = useState(10);
  const [pair, setPair] = useState<[string, string]>(['bag', 'kg']);
  const [testCommodity, setTestCommodity] = useState(settingsCommodities[0]?.id ?? '');

  const setUnit = (i: number, patch: Partial<Unit>) => d.set('units', units.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const setPack = (id: string, patch: Partial<PackagingProfile>) => d.set('packaging', packaging.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const profile = packaging.find((p) => p.commodityId === testCommodity);
  let converted: string;
  try {
    converted = f.number(convert(qty, pair[0], pair[1], units, profile ? { nominalKg: profile.maxKg } : undefined), { maximumFractionDigits: 3 });
  } catch {
    converted = '—';
  }
  const errors: string[] = [];
  if (packaging.some((p) => p.minKg > p.maxKg)) errors.push(t('set.units.errRange'));
  if (units.some((u) => !(u.toBase > 0))) errors.push(t('set.units.errFactor'));

  return (
    <SettingsFrame page="units" {...bind(d)} errors={errors}>
      <Section title={t('set.units.units')} description={t('set.units.unitsHint')}>
        <EditTable head={[t('set.units.code'), t('set.units.kind'), t('set.units.factor'), '']}>
          {units.map((u, i) => (
            <tr key={u.id}>
              <td><TextInput value={u.code} onChange={(code) => setUnit(i, { code })} className="font-mono" aria-label={t('set.units.code')} /></td>
              <td className="w-44">
                <Select value={u.kind} onChange={(kind) => setUnit(i, { kind })} options={(['mass', 'area', 'count'] as const).map((k) => ({ value: k, label: t(`set.units.kindName.${k}`) }))} aria-label={t('set.units.kind')} />
              </td>
              <td className="w-48"><NumberInput value={u.toBase} onChange={(toBase) => setUnit(i, { toBase })} suffix={u.kind === 'area' ? 'ha' : u.kind === 'mass' ? 'kg' : '×'} disabled={u.kind === 'count'} aria-label={t('set.units.factor')} /></td>
              <td className="w-12">{['kg', 'bag', 'ha'].includes(u.id) ? null : <RowDelete label={t('set.remove')} onClick={() => d.set('units', units.filter((_, j) => j !== i))} />}</td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <AddRow onClick={() => d.set('units', [...units, { id: uid('unit'), code: 'unit', kind: 'mass', toBase: 1 }])}>{t('set.units.add')}</AddRow>
          <Mini label={t('set.units.landUnit')} className="w-56">
            <Select value={landUnitId} onChange={(x) => d.set('landUnitId', x)} options={units.filter((u) => u.kind === 'area').map((u) => ({ value: u.id, label: u.code }))} />
          </Mini>
        </div>
      </Section>

      <Section title={t('set.units.packaging')} description={t('set.units.packagingHint')}>
        <EditTable head={[t('set.units.commodity'), t('set.units.profile'), t('set.units.minKg'), t('set.units.maxKg'), t('set.units.tare'), t('set.units.tag'), t('set.units.mode')]}>
          {packaging.map((p) => {
            const c = settingsCommodities.find((x) => x.id === p.commodityId);
            return (
              <tr key={p.id}>
                <td className="whitespace-nowrap font-medium text-ink">{c ? commodityName(c, lang) : p.commodityId}</td>
                <td><TextInput value={p.name} onChange={(name) => setPack(p.id, { name })} aria-label={t('set.units.profile')} /></td>
                <td className="w-28"><NumberInput value={p.minKg} min={0} onChange={(minKg) => setPack(p.id, { minKg })} aria-label={t('set.units.minKg')} /></td>
                <td className="w-28"><NumberInput value={p.maxKg} min={0} onChange={(maxKg) => setPack(p.id, { maxKg })} aria-label={t('set.units.maxKg')} /></td>
                <td className="w-24"><NumberInput value={p.tareKg} min={0} step={0.1} onChange={(tareKg) => setPack(p.id, { tareKg })} aria-label={t('set.units.tare')} /></td>
                <td className="w-28"><Select value={p.tag} onChange={(tag) => setPack(p.id, { tag })} options={(['QR', 'NFC', 'NONE'] as const).map((x) => ({ value: x, label: t(`set.units.tagName.${x}`) }))} aria-label={t('set.units.tag')} /></td>
                <td className="w-36"><Select value={p.mode} onChange={(mode) => setPack(p.id, { mode })} options={(['PER_BAG', 'LOT'] as const).map((x) => ({ value: x, label: t(`set.units.modeName.${x}`) }))} aria-label={t('set.units.mode')} /></td>
              </tr>
            );
          })}
        </EditTable>
        {settingsCommodities.filter((c) => !packaging.some((p) => p.commodityId === c.id)).map((c) => (
          <div key={c.id} className="mt-3">
            <AddRow onClick={() => d.set('packaging', [...packaging, { id: `pk_${c.id}`, commodityId: c.id, name: t('set.units.defaultSack'), minKg: 40, maxKg: 100, tareKg: 0.5, tag: 'QR', mode: 'PER_BAG' }])}>
              {t('set.units.addProfile', { commodity: commodityName(c, lang) })}
            </AddRow>
          </div>
        ))}
      </Section>

      <Section title={t('set.units.tester')} description={t('set.units.testerHint')}>
        <div className="flex flex-wrap items-end gap-3 rounded-ctl border border-line bg-canvas p-4">
          <Mini label={t('set.units.qty')} className="w-28"><NumberInput value={qty} onChange={setQty} /></Mini>
          <Mini label={t('set.units.from')} className="w-28"><Select value={pair[0]} onChange={(x) => setPair([x, pair[1]])} options={units.map((u) => ({ value: u.id, label: u.code }))} /></Mini>
          <ArrowRight className="mb-3 h-4 w-4 text-muted" />
          <Mini label={t('set.units.to')} className="w-28"><Select value={pair[1]} onChange={(x) => setPair([pair[0], x])} options={units.map((u) => ({ value: u.id, label: u.code }))} /></Mini>
          <Mini label={t('set.units.commodity')} className="w-48"><Select value={testCommodity} onChange={setTestCommodity} options={settingsCommodities.map((c) => ({ value: c.id, label: commodityName(c, lang) }))} /></Mini>
          <div className="mb-2.5 ml-auto text-[20px] font-semibold text-ink tnum" aria-live="polite">{converted} {units.find((u) => u.id === pair[1])?.code}</div>
        </div>
      </Section>
    </SettingsFrame>
  );
}

const useCommodities = () => useOrgSettings().commodities;

// ---------------------------------------------------------------- Price lists

const PRICE_KEYS = ['priceList', 'pricing'] as const;

export function PriceListsPage() {
  const d = useSettingsDraft('priceLists', PRICE_KEYS);
  const { priceList, pricing } = d.value;
  const commodities = useCommodities();
  const { zones, priceList: original } = useOrgSettings();
  const org = useCurrentOrg();
  const lang = useLang();
  const { t } = useT();
  const f = useFormat();
  const userId = useSessionStore((s) => s.userId);
  const [commodityId, setCommodityId] = useState(commodities[0]?.id ?? '');
  const commodity = commodities.find((c) => c.id === commodityId);
  const rows = priceList.filter((p) => p.commodityId === commodityId);
  const setEntry = (id: string, patch: Partial<PriceListEntry>) => d.set('priceList', priceList.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const today = new Date().toISOString().slice(0, 10);

  // Every price change is kept in the history when saved.
  const save = () => {
    const changes = priceList
      .map((p) => ({ p, before: original.find((o) => o.id === p.id) }))
      .filter((x) => x.before && x.before.price.amountMinor !== x.p.price.amountMinor)
      .map((x) => ({ id: uid('pc'), entryId: x.p.id, at: new Date().toISOString(), by: userId ?? 'system', fromMinor: x.before!.price.amountMinor, toMinor: x.p.price.amountMinor }));
    d.save(changes.length ? { pricing: { ...pricing, history: [...changes, ...pricing.history].slice(0, 200) } } : undefined);
  };
  const errors: string[] = [];
  if (priceList.some((p) => p.price.amountMinor <= 0)) errors.push(t('set.prices.errPrice'));
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? t('set.prices.allZones');

  return (
    <SettingsFrame page="priceLists" {...bind(d)} onSave={save} errors={errors}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Mini label={t('set.units.commodity')} className="w-64">
          <Select value={commodityId} onChange={setCommodityId} options={commodities.map((c) => ({ value: c.id, label: commodityName(c, lang) }))} />
        </Mini>
        <AddRow onClick={() => d.set('priceList', [...priceList, { id: uid('pl'), commodityId, zoneId: zones[0]?.id ?? '', grade: commodity?.grades[0], unitId: 'kg', price: { amountMinor: rows[0]?.price.amountMinor ?? 100, currency: org.currency }, tolerancePct: 10, effectiveFrom: today }])}>
          {t('set.prices.add')}
        </AddRow>
      </div>

      <Section title={t('set.prices.list', { commodity: commodity ? commodityName(commodity, lang) : '' })} description={t('set.prices.listHint')}>
        <EditTable head={[t('set.prices.zone'), t('set.prices.grade'), t('set.prices.price'), t('set.prices.tolerance'), t('set.prices.from'), t('set.prices.to'), '']}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="min-w-40"><Select value={p.zoneId} onChange={(zoneId) => setEntry(p.id, { zoneId })} options={zones.map((z) => ({ value: z.id, label: z.name }))} aria-label={t('set.prices.zone')} /></td>
              <td className="w-32"><Select value={p.grade ?? ''} onChange={(g) => setEntry(p.id, { grade: g || undefined })} options={[{ value: '', label: t('set.prices.anyGrade') }, ...(commodity?.grades ?? []).map((g) => ({ value: g, label: g }))]} aria-label={t('set.prices.grade')} /></td>
              <td className="w-44"><MoneyInput minor={p.price.amountMinor} currency={p.price.currency} onChange={(m) => setEntry(p.id, { price: { ...p.price, amountMinor: m } })} aria-label={t('set.prices.price')} /></td>
              <td className="w-28"><NumberInput value={p.tolerancePct} min={0} suffix="%" onChange={(tolerancePct) => setEntry(p.id, { tolerancePct })} aria-label={t('set.prices.tolerance')} /></td>
              <td className="w-40"><TextInput type="date" value={p.effectiveFrom} onChange={(effectiveFrom) => setEntry(p.id, { effectiveFrom })} aria-label={t('set.prices.from')} /></td>
              <td className="w-40"><TextInput type="date" value={p.effectiveTo ?? ''} onChange={(v) => setEntry(p.id, { effectiveTo: v || undefined })} aria-label={t('set.prices.to')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => d.set('priceList', priceList.filter((x) => x.id !== p.id))} /></td>
            </tr>
          ))}
        </EditTable>
        {!rows.length && <p className="mt-3 text-[14px] text-muted">{t('set.prices.empty')}</p>}
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title={t('set.prices.premiums')} description={t('set.prices.premiumsHint')}>
          <EditTable head={[t('set.prices.premium'), t('set.prices.uplift'), '']} className="[&_table]:min-w-0">
            {pricing.premiums.map((p, i) => (
              <tr key={p.id}>
                <td><TextInput value={p.name} onChange={(name) => d.set('pricing', { ...pricing, premiums: pricing.premiums.map((x, j) => (j === i ? { ...x, name } : x)) })} aria-label={t('set.prices.premium')} /></td>
                <td className="w-32"><NumberInput value={p.pct} suffix="%" onChange={(pct) => d.set('pricing', { ...pricing, premiums: pricing.premiums.map((x, j) => (j === i ? { ...x, pct } : x)) })} aria-label={t('set.prices.uplift')} /></td>
                <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => d.set('pricing', { ...pricing, premiums: pricing.premiums.filter((_, j) => j !== i) })} /></td>
              </tr>
            ))}
          </EditTable>
          <div className="mt-3"><AddRow onClick={() => d.set('pricing', { ...pricing, premiums: [...pricing.premiums, { id: uid('pm'), name: '', pct: 5 }] })}>{t('set.prices.addPremium')}</AddRow></div>
          <div className="mt-5">
            <Rows>
              <SwitchRow label={t('set.prices.approval')} description={t('set.prices.approvalHint')} checked={pricing.changeApproval} onChange={(v) => d.set('pricing', { ...pricing, changeApproval: v })} />
            </Rows>
          </div>
        </Section>
        <Section title={t('set.prices.history')}>
          {pricing.history.length ? (
            <ul className="divide-y divide-line rounded-ctl border border-line text-[14px]">
              {pricing.history.slice(0, 8).map((h) => {
                const e = priceList.find((p) => p.id === h.entryId);
                return (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-ink">{e ? `${zoneName(e.zoneId)}${e.grade ? ` · ${e.grade}` : ''}` : h.entryId}</span>
                    <span className="tnum text-muted">{f.money({ amountMinor: h.fromMinor, currency: org.currency })} → <span className="font-medium text-ink">{f.money({ amountMinor: h.toMinor, currency: org.currency })}</span> · {f.relative(h.at)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-ctl border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted">{t('set.prices.noHistory')}</p>
          )}
        </Section>
      </div>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Buying rules

const BUYING_KEYS = ['buyingRules'] as const;

export function BuyingRulesPage() {
  const d = useSettingsDraft('buyingRules', BUYING_KEYS);
  const r = d.value.buyingRules;
  const commodities = useCommodities();
  const org = useCurrentOrg();
  const lang = useLang();
  const { t } = useT();
  const set = (patch: Partial<BuyingRules>) => d.set('buyingRules', { ...r, ...patch });
  const MODELS = ['CASH_ADVANCE', 'DIRECT_PAYMENT'] as const;
  const errors: string[] = [];
  if (commodities.some((c) => !(r.sourcingModels[c.id]?.length))) errors.push(t('set.buying.errModel'));

  return (
    <SettingsFrame page="buyingRules" {...bind(d)} errors={errors}>
      <Section title={t('set.buying.sourcing')} description={t('set.buying.sourcingHint')}>
        <EditTable head={[t('set.units.commodity'), ...MODELS.map((m) => t(`set.buying.model.${m}`))]} className="[&_table]:min-w-0">
          {commodities.map((c) => {
            const on = r.sourcingModels[c.id] ?? [];
            return (
              <tr key={c.id}>
                <td className="font-medium text-ink">{commodityName(c, lang)}</td>
                {MODELS.map((m) => (
                  <td key={m}>
                    <Checkbox label={<span className="sr-only">{t(`set.buying.model.${m}`)}</span>} checked={on.includes(m)} onChange={(e) => set({ sourcingModels: { ...r.sourcingModels, [c.id]: e.target.checked ? [...on, m] : on.filter((x) => x !== m) } })} />
                  </td>
                ))}
              </tr>
            );
          })}
        </EditTable>
      </Section>

      <Section title={t('set.buying.disbursement')}>
        <Rows>
          <SwitchRow label={t('set.buying.partial')} description={t('set.buying.partialHint')} checked={r.partialDisbursements} onChange={(v) => set({ partialDisbursements: v })} />
        </Rows>
        <Grid cols={3} className="mt-5">
          <Mini label={t('set.buying.maxPartial')}><NumberInput value={r.maxPartialCount} min={1} max={10} disabled={!r.partialDisbursements} onChange={(v) => set({ maxPartialCount: Math.round(v) })} /></Mini>
          <Mini label={t('set.buying.cashLimit')}><MoneyInput minor={r.agentCashLimitMinor} currency={org.currency} onChange={(v) => set({ agentCashLimitMinor: v })} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.buying.recon')} description={t('set.buying.reconHint')}>
        <Grid cols={3}>
          <Mini label={t('set.buying.tolAmount')}><MoneyInput minor={r.reconToleranceMinor} currency={org.currency} onChange={(v) => set({ reconToleranceMinor: v })} /></Mini>
          <Mini label={t('set.buying.tolPct')}><NumberInput value={r.reconTolerancePct} min={0} step={0.1} suffix="%" onChange={(v) => set({ reconTolerancePct: v })} /></Mini>
          <Mini label={t('set.buying.writeOff')}><MoneyInput minor={r.writeOffLimitMinor} currency={org.currency} onChange={(v) => set({ writeOffLimitMinor: v })} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.buying.debt')} description={t('set.buying.debtHint')}>
        <div className="flex flex-wrap items-end gap-5">
          <Segmented label={t('set.buying.debt')} value={r.debtPolicy} onChange={(debtPolicy) => set({ debtPolicy })} options={(['block', 'warn', 'deduct'] as const).map((p) => ({ value: p, label: t(`set.buying.debtPolicy.${p}`) }))} />
          <Mini label={t('set.buying.debtMin')} className="w-56"><MoneyInput minor={r.debtMinimumMinor} currency={org.currency} onChange={(v) => set({ debtMinimumMinor: v })} /></Mini>
        </div>
        <p className="mt-3 text-[13px] text-muted">{t(`set.buying.debtExplain.${r.debtPolicy}`)}</p>
      </Section>

      <Section title={t('set.buying.evidence')}>
        <Rows>
          {(['scalePhoto', 'voiceNote', 'gps', 'signature'] as const).map((k) => (
            <SwitchRow key={k} label={t(`set.buying.ev.${k}`)} checked={r.evidence[k]} onChange={(v) => set({ evidence: { ...r.evidence, [k]: v } })} />
          ))}
          <SwitchRow label={t('set.buying.overrideReason')} description={t('set.buying.overrideReasonHint')} checked={r.priceOverrideReasonRequired} onChange={(v) => set({ priceOverrideReasonRequired: v })} />
        </Rows>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Inventory rules

const INVENTORY_KEYS = ['inventoryRules'] as const;
const MOVEMENTS: MovementType[] = ['INBOUND', 'TRANSFER', 'STORAGE'];

export function InventoryRulesPage() {
  const d = useSettingsDraft('inventoryRules', INVENTORY_KEYS);
  const r = d.value.inventoryRules;
  const commodities = useCommodities();
  const lang = useLang();
  const { t } = useT();
  const f = useFormat();
  const set = (patch: Partial<InventoryRules>) => d.set('inventoryRules', { ...r, ...patch });
  const pct = (c: string, m: MovementType) => r.tolerances.find((x) => x.commodityId === c && x.movement === m)?.pct ?? 0;
  const setPct = (c: string, m: MovementType, v: number) => {
    const exists = r.tolerances.some((x) => x.commodityId === c && x.movement === m);
    set({ tolerances: exists ? r.tolerances.map((x) => (x.commodityId === c && x.movement === m ? { ...x, pct: v } : x)) : [...r.tolerances, { commodityId: c, movement: m, pct: v }] });
  };
  const [sample, setSample] = useState({ commodityId: commodities[0]?.id ?? '', expected: 10_000, received: 9_960 });
  const tol = pct(sample.commodityId, 'INBOUND');
  const lossPct = sample.expected > 0 ? ((sample.expected - sample.received) / sample.expected) * 100 : 0;
  const within = lossPct <= tol;
  const errors = useMemo(() => (r.tolerances.some((x) => x.pct < 0 || x.pct > 20) ? [t('set.inventory.errRange')] : []), [r.tolerances, t]);

  return (
    <SettingsFrame page="inventoryRules" {...bind(d)} errors={errors}>
      <Section title={t('set.inventory.tolerance')} description={t('set.inventory.toleranceHint')}>
        <EditTable head={[t('set.units.commodity'), ...MOVEMENTS.map((m) => t(`set.inventory.movement.${m}`))]} className="[&_table]:min-w-0">
          {commodities.map((c) => (
            <tr key={c.id}>
              <td className="font-medium text-ink">{commodityName(c, lang)}</td>
              {MOVEMENTS.map((m) => (
                <td key={m} className="w-40">
                  <NumberInput value={pct(c.id, m)} min={0} max={20} step={0.1} suffix="%" onChange={(v) => setPct(c.id, m, v)} aria-label={`${commodityName(c, lang)} · ${t(`set.inventory.movement.${m}`)}`} />
                </td>
              ))}
            </tr>
          ))}
        </EditTable>
        <div className="mt-4 rounded-ctl border border-line bg-canvas p-4">
          <div className="eyebrow mb-3">{t('set.inventory.check')}</div>
          <div className="flex flex-wrap items-end gap-3">
            <Mini label={t('set.units.commodity')} className="w-48"><Select value={sample.commodityId} onChange={(commodityId) => setSample({ ...sample, commodityId })} options={commodities.map((c) => ({ value: c.id, label: commodityName(c, lang) }))} /></Mini>
            <Mini label={t('set.inventory.expected')} className="w-36"><NumberInput value={sample.expected} suffix="kg" onChange={(expected) => setSample({ ...sample, expected })} /></Mini>
            <Mini label={t('set.inventory.received')} className="w-36"><NumberInput value={sample.received} suffix="kg" onChange={(received) => setSample({ ...sample, received })} /></Mini>
            <div className="mb-2 ml-auto text-right" aria-live="polite">
              <div className="text-[13px] text-muted">{t('set.inventory.loss', { pct: f.number(lossPct, { maximumFractionDigits: 2 }), tol: f.number(tol) })}</div>
              <Badge tone={within ? 'success' : 'warning'}>{t(within ? (r.autoWriteOff ? 'set.inventory.autoWrittenOff' : 'set.inventory.within') : 'set.inventory.discrepancy')}</Badge>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t('set.inventory.transfers')}>
        <Grid cols={3}>
          <Mini label={t('set.inventory.bounds')}><NumberInput value={r.transferBoundsPct} min={0} step={0.1} suffix="%" onChange={(transferBoundsPct) => set({ transferBoundsPct })} /></Mini>
        </Grid>
        <div className="mt-5">
          <Rows>
            <SwitchRow label={t('set.inventory.autoWriteOff')} description={t('set.inventory.autoWriteOffHint')} checked={r.autoWriteOff} onChange={(autoWriteOff) => set({ autoWriteOff })} />
          </Rows>
        </div>
      </Section>

      <Section title={t('set.inventory.counts')}>
        <div className="flex flex-wrap items-end gap-6">
          <Mini label={t('set.inventory.frequency')}>
            <Segmented label={t('set.inventory.frequency')} value={r.stockCount.frequency} onChange={(frequency) => set({ stockCount: { ...r.stockCount, frequency } })} options={(['WEEKLY', 'MONTHLY', 'QUARTERLY'] as const).map((x) => ({ value: x, label: t(`set.freq.${x}`) }))} />
          </Mini>
          <Mini label={t('set.inventory.basis')}>
            <Segmented label={t('set.inventory.basis')} value={r.stockCount.basis} onChange={(basis) => set({ stockCount: { ...r.stockCount, basis } })} options={(['FULL', 'CYCLE'] as const).map((x) => ({ value: x, label: t(`set.inventory.basisName.${x}`) }))} />
          </Mini>
        </div>
        <div className="mt-5">
          <Rows>
            <SwitchRow label={t('set.inventory.blind')} description={t('set.inventory.blindHint')} checked={r.stockCount.blind} onChange={(blind) => set({ stockCount: { ...r.stockCount, blind } })} />
          </Rows>
        </div>
      </Section>

      <Section title={t('set.inventory.liability')} description={t('set.inventory.liabilityHint')}>
        <div className="flex flex-wrap items-end gap-6">
          <Mini label={t('set.inventory.payer')}>
            <Segmented label={t('set.inventory.payer')} value={r.liability.payer} onChange={(payer) => set({ liability: { ...r.liability, payer } })} options={(['AGENT', 'TRANSPORTER', 'COMPANY'] as const).map((x) => ({ value: x, label: t(`set.inventory.payerName.${x}`) }))} />
          </Mini>
          <Mini label={t('set.inventory.priceBasis')}>
            <Segmented label={t('set.inventory.priceBasis')} value={r.liability.priceBasis} onChange={(priceBasis) => set({ liability: { ...r.liability, priceBasis } })} options={(['PURCHASE', 'LIST'] as const).map((x) => ({ value: x, label: t(`set.inventory.priceBasisName.${x}`) }))} />
          </Mini>
        </div>
        <div className="mt-5">
          <Rows>
            <SwitchRow label={t('set.inventory.includeLogistics')} checked={r.liability.includeLogistics} onChange={(includeLogistics) => set({ liability: { ...r.liability, includeLogistics } })} />
          </Rows>
        </div>
      </Section>
    </SettingsFrame>
  );
}
