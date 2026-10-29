import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { AgentType, FieldTeamSettings, LoanTerms, SupportSettings, SupportType } from '@/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/shared/Field';
import { buildLedger, quote } from '@/engines/loans';
import { toMinor } from '@/engines/money';
import { TILES } from '@/mobile/flows/catalog';
import { uid } from '@/lib/utils';
import { useCurrentOrg, useFormat, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { FieldTeamExtras, scoreErrors } from './fieldTeamExtras';
import {
  AddRow, ChipsInput, EditTable, Grid, LangInputs, Mini, MoneyInput, NumberInput, RowDelete, Rows, Section, Segmented, Select, SettingsFrame, SwitchRow, TextInput,
} from '../kit';

// ---------------------------------------------------------------- Support & loans

const SUPPORT_KEYS = ['support', 'loanTerms'] as const;

export function SupportLoansPage() {
  const d = useSettingsDraft('supportLoans', SUPPORT_KEYS);
  const { support, loanTerms: lt } = d.value;
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const langs = org.languages.length ? org.languages : [org.language];
  const setS = (patch: Partial<SupportSettings>) => d.set('support', { ...support, ...patch });
  const setType = (id: string, patch: Partial<SupportType>) => setS({ types: support.types.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const setL = (patch: Partial<LoanTerms>) => d.set('loanTerms', { ...lt, ...patch });
  const moveWaterfall = (i: number, dir: -1 | 1) => {
    const w = [...lt.waterfall];
    const j = i + dir;
    if (j < 0 || j >= w.length) return;
    [w[i], w[j]] = [w[j]!, w[i]!];
    setL({ waterfall: w });
  };

  // Live example: a loan disbursed 8 months ago, window ended 2 months ago, one produce repayment.
  const example = useMemo(() => {
    const day = (monthsAgo: number) => new Date(Date.now() - monthsAgo * 30.44 * 86_400_000).toISOString().slice(0, 10);
    const principal = { amountMinor: toMinor(org.currency === 'XOF' ? 300_000 : 1_000, org.currency), currency: org.currency };
    const window = { start: day(8), end: day(2) };
    const repayments = [{ date: day(3), amountMinor: Math.round(principal.amountMinor * 0.3), mode: 'PRODUCE' as const }];
    try {
      const ledger = buildLedger(principal, lt, window, repayments, new Date());
      const cash = quote(principal, lt, window, repayments, new Date(), 'cash');
      return { principal, ledger, cash, repaid: repayments[0]!.amountMinor };
    } catch {
      return null;
    }
  }, [lt, org.currency]);

  const errors: string[] = [];
  if (lt.rate < 0 || lt.rate > 1) errors.push(t('set.loans.errRate'));
  if (!support.repaymentModes.length) errors.push(t('set.support.errModes'));

  return (
    <SettingsFrame page="supportLoans" {...bind(d)} errors={errors}>
      <Section title={t('set.support.types')} description={t('set.support.typesHint')}>
        <div className="space-y-3">
          {support.types.map((s) => (
            <div key={s.id} className="rounded-card border border-line p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_160px_minmax(0,1fr)_auto]">
                <Mini label={t('set.support.name')}><LangInputs label={t('set.support.name')} value={s.name} onChange={(name) => setType(s.id, { name })} languages={langs} /></Mini>
                <Mini label={t('set.support.kind')}>
                  <Select value={s.kind} onChange={(kind) => setType(s.id, { kind })} options={(['CASH', 'INPUT', 'SERVICE'] as const).map((k) => ({ value: k, label: t(`set.support.kindName.${k}`) }))} />
                </Mini>
                <Mini label={t('set.support.subTypes')}><ChipsInput label={t('set.support.subTypes')} values={s.subTypes} onChange={(subTypes) => setType(s.id, { subTypes })} /></Mini>
                <div className="flex items-end gap-2 pb-0.5">
                  <Switch checked={s.enabled} onCheckedChange={(enabled) => setType(s.id, { enabled })} aria-label={t('set.enabled')} />
                  <RowDelete label={t('set.remove')} onClick={() => setS({ types: support.types.filter((x) => x.id !== s.id) })} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-6">
                <Mini label={t('set.support.max')} className="w-56"><MoneyInput minor={s.maxAmountMinor} currency={org.currency} onChange={(maxAmountMinor) => setType(s.id, { maxAmountMinor })} /></Mini>
                <Checkbox label={t('set.support.groupScoring')} checked={s.groupScoring} onChange={(e) => setType(s.id, { groupScoring: e.target.checked })} />
                <Checkbox label={t('set.support.recoverable')} checked={s.recoverable} onChange={(e) => setType(s.id, { recoverable: e.target.checked })} />
                <Checkbox label={t('set.support.needsProvider')} checked={!!s.needsProvider} onChange={(e) => setType(s.id, { needsProvider: e.target.checked })} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Mini label={t('set.support.code')}><TextInput value={s.code ?? ''} className="font-mono uppercase" onChange={(code) => setType(s.id, { code: code.toUpperCase() })} /></Mini>
                <Mini label={t('set.support.unit')}>
                  <Select value={s.unit ?? 'MONEY'} onChange={(unit) => setType(s.id, { unit })} options={(['MONEY', 'ACRES', 'HA', 'BAGS'] as const).map((k) => ({ value: k, label: t(`set.support.unitName.${k}`) }))} />
                </Mini>
                <Mini label={t('set.support.payout')}>
                  <Select value={s.payout ?? 'GROUP_WALLET'} onChange={(payout) => setType(s.id, { payout })} options={(['GROUP_WALLET', 'FARMER_WALLET', 'SUPPLIER', 'IN_KIND'] as const).map((k) => ({ value: k, label: t(`set.support.payoutName.${k}`) }))} />
                </Mini>
              </div>
              <div className="mt-4">
                <div className="eyebrow mb-2">{t('set.support.evidence')}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(['leaderVoice', 'witnessVoice', 'agreement', 'thumbprints', 'photo'] as const).map((k) => {
                    const ev = s.evidence ?? { leaderVoice: false, witnessVoice: false, agreement: false, thumbprints: false, photo: false };
                    return <Checkbox key={k} label={t(`set.support.evidenceName.${k}`)} checked={ev[k]} onChange={(e) => setType(s.id, { evidence: { ...ev, [k]: e.target.checked } })} />;
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <AddRow onClick={() => setS({ types: [...support.types, { id: uid('st'), name: { [org.language]: t('set.support.newType') }, kind: 'INPUT', subTypes: [], groupScoring: false, recoverable: true, maxAmountMinor: 0, enabled: true }] })}>{t('set.support.addType')}</AddRow>
        </div>
      </Section>

      <Section title={t('set.support.recovery')}>
        <Grid cols={3}>
          <Mini label={t('set.support.window')}><NumberInput value={support.recoveryWindowDays} min={1} suffix={t('set.days')} onChange={(v) => setS({ recoveryWindowDays: Math.round(v) })} /></Mini>
          <Mini label={t('set.support.minScore')}><NumberInput value={support.minGroupScore} min={0} max={100} onChange={(v) => setS({ minGroupScore: Math.round(v) })} /></Mini>
          <Mini label={t('set.support.modes')}>
            <div className="flex h-11 flex-wrap items-center gap-4">
              {(['CASH', 'PRODUCE', 'MIXED'] as const).map((m) => (
                <Checkbox key={m} label={t(`set.support.mode.${m}`)} checked={support.repaymentModes.includes(m)} onChange={(e) => setS({ repaymentModes: e.target.checked ? [...support.repaymentModes, m] : support.repaymentModes.filter((x) => x !== m) })} />
              ))}
            </div>
          </Mini>
          <Mini label={t('set.support.abilityToPay')} className="md:col-span-3"><ChipsInput label={t('set.support.abilityToPay')} values={support.abilityToPay} onChange={(abilityToPay) => setS({ abilityToPay })} /></Mini>
        </Grid>
        <div className="mt-5">
          <Rows>
            <SwitchRow label={t('set.support.block')} description={t('set.support.blockHint')} checked={support.blockOnDebt} onChange={(blockOnDebt) => setS({ blockOnDebt })} />
            <SwitchRow label={t('set.support.linkPr')} description={t('set.support.linkPrHint')} checked={!!support.linkPurchaseRequest} onChange={(linkPurchaseRequest) => setS({ linkPurchaseRequest })} />
            <SwitchRow label={t('set.support.lendAgain')} description={t('set.support.lendAgainHint')} checked={support.feedback?.lendAgain ?? false} onChange={(lendAgain) => setS({ feedback: { experience: support.feedback?.experience ?? [], lendAgain } })} />
          </Rows>
          <Mini label={t('set.support.experience')} className="mt-4"><ChipsInput label={t('set.support.experience')} values={support.feedback?.experience ?? []} onChange={(experience) => setS({ feedback: { lendAgain: support.feedback?.lendAgain ?? false, experience } })} /></Mini>
        </div>
      </Section>

      <Section title={t('set.loans.terms')} description={t('set.loans.termsHint')}>
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-6">
              <Mini label={t('set.loans.interest')}>
                <Segmented label={t('set.loans.interest')} value={lt.interestType} onChange={(interestType) => setL({ interestType })} options={(['none', 'simple', 'compound'] as const).map((x) => ({ value: x, label: t(`set.loans.interestType.${x}`) }))} />
              </Mini>
              <Mini label={t('set.loans.period')}>
                <Segmented label={t('set.loans.period')} value={lt.period} onChange={(period) => setL({ period })} options={(['daily', 'monthly'] as const).map((x) => ({ value: x, label: t(`set.loans.periodName.${x}`) }))} />
              </Mini>
            </div>
            <Grid cols={3}>
              <Mini label={t('set.loans.rate')}><NumberInput value={Math.round(lt.rate * 10000) / 100} min={0} step={0.1} suffix="%" disabled={lt.interestType === 'none'} onChange={(v) => setL({ rate: v / 100 })} /></Mini>
              <Mini label={t('set.loans.grace')}>
                <Select value={lt.graceStarts} onChange={(graceStarts) => setL({ graceStarts })} options={(['windowEnd', 'disbursement'] as const).map((x) => ({ value: x, label: t(`set.loans.graceName.${x}`) }))} />
              </Mini>
              <Mini label={t('set.loans.maxCycles')}><NumberInput value={lt.maxCycles} min={1} onChange={(v) => setL({ maxCycles: Math.round(v) })} /></Mini>
              <Mini label={t('set.loans.penalty')}>
                <Select value={lt.penalty.type} onChange={(type) => setL({ penalty: { ...lt.penalty, type } })} options={(['none', 'one-time-percent', 'late-percent', 'flat'] as const).map((x) => ({ value: x, label: t(`set.loans.penaltyType.${x}`) }))} />
              </Mini>
              <Mini label={t('set.loans.penaltyTrigger')}>
                <Select value={lt.penalty.trigger} disabled={lt.penalty.type === 'none'} onChange={(trigger) => setL({ penalty: { ...lt.penalty, trigger } })} options={(['onCashRepayment', 'onLate'] as const).map((x) => ({ value: x, label: t(`set.loans.trigger.${x}`) }))} />
              </Mini>
              <Mini label={t('set.loans.penaltyRate')}>
                {lt.penalty.type === 'flat' ? (
                  <MoneyInput minor={lt.penalty.rate} currency={org.currency} onChange={(rate) => setL({ penalty: { ...lt.penalty, rate } })} />
                ) : (
                  <NumberInput value={Math.round(lt.penalty.rate * 10000) / 100} min={0} suffix="%" disabled={lt.penalty.type === 'none'} onChange={(v) => setL({ penalty: { ...lt.penalty, rate: v / 100 } })} />
                )}
              </Mini>
              <Mini label={t('set.loans.tolerance')}><NumberInput value={lt.settlementTolerance} min={0} suffix={t('set.loans.minorUnits')} onChange={(v) => setL({ settlementTolerance: Math.round(v) })} /></Mini>
              <Mini label={t('set.loans.rounding')}>
                <Segmented label={t('set.loans.rounding')} value={lt.rounding} onChange={(rounding) => setL({ rounding })} options={(['up', 'nearest'] as const).map((x) => ({ value: x, label: t(`set.loans.roundingName.${x}`) }))} />
              </Mini>
            </Grid>
            <Mini label={t('set.loans.waterfall')}>
              <ol className="mt-1 space-y-1.5">
                {lt.waterfall.map((w, i) => (
                  <li key={w} className="flex w-72 items-center gap-3 rounded-ctl border border-line px-3 py-2 text-[14px]">
                    <span className="font-mono text-[12px] text-muted">{i + 1}</span>
                    <span className="flex-1 font-medium text-ink">{t(`set.loans.component.${w}`)}</span>
                    <Button variant="ghost" size="iconSm" onClick={() => moveWaterfall(i, -1)} disabled={i === 0} aria-label={t('set.moveUp')}><ArrowUp /></Button>
                    <Button variant="ghost" size="iconSm" onClick={() => moveWaterfall(i, 1)} disabled={i === lt.waterfall.length - 1} aria-label={t('set.moveDown')}><ArrowDown /></Button>
                  </li>
                ))}
              </ol>
            </Mini>
          </div>

          {example && (
            <aside className="h-fit rounded-card border border-line bg-canvas p-5" aria-live="polite">
              <div className="eyebrow mb-3">{t('set.loans.example')}</div>
              <p className="text-[13px] text-muted">{t('set.loans.exampleHint', { principal: f.money(example.principal), repaid: f.money(example.repaid) })}</p>
              <dl className="mt-4 space-y-2 text-[14px]">
                {([
                  ['principal', example.ledger.principal],
                  ['interest', example.ledger.interest],
                  ['penalty', example.ledger.penalty],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-body">{t(`set.loans.component.${k}`)}</dt><dd className="tnum text-ink">{f.money(v)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>{t('set.loans.balance')}</dt><dd className="tnum">{f.money(example.ledger.balance)}</dd></div>
                <div className="flex justify-between text-[13px]"><dt className="text-muted">{t('set.loans.cashQuote')}</dt><dd className="tnum text-ink">{f.money(example.cash.amount)}</dd></div>
              </dl>
            </aside>
          )}
        </div>
      </Section>
    </SettingsFrame>
  );
}

// ---------------------------------------------------------------- Field team

const FIELD_KEYS = ['agentTypes', 'fieldTeam'] as const;

export function FieldTeamPage() {
  const d = useSettingsDraft('fieldTeam', FIELD_KEYS);
  const { agentTypes, fieldTeam: ft } = d.value;
  const org = useCurrentOrg();
  const { t } = useT();
  const langs = org.languages.length ? org.languages : [org.language];
  const setFt = (patch: Partial<FieldTeamSettings>) => d.set('fieldTeam', { ...ft, ...patch });
  const setAt = (id: string, patch: Partial<AgentType>) => d.set('agentTypes', agentTypes.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const [open, setOpen] = useState<string | null>(agentTypes[0]?.id ?? null);
  const listEdit = <K extends 'costCategories' | 'penaltyBands' | 'allowanceTypes' | 'issueCategories'>(key: K, id: string, patch: Partial<FieldTeamSettings[K][number]>) =>
    setFt({ [key]: (ft[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) } as Partial<FieldTeamSettings>);
  const listRemove = (key: 'costCategories' | 'penaltyBands' | 'allowanceTypes' | 'issueCategories', id: string) =>
    setFt({ [key]: (ft[key] as { id: string }[]).filter((x) => x.id !== id) } as Partial<FieldTeamSettings>);

  const errors: string[] = [];
  if (ft.plan.minDays > ft.plan.maxDays) errors.push(t('set.field.errDays'));
  const bands = [...ft.penaltyBands].sort((a, b) => a.fromPct - b.fromPct);
  if (bands.some((b, i) => b.fromPct >= b.toPct || (i > 0 && b.fromPct < bands[i - 1]!.toPct))) errors.push(t('set.field.errBands'));
  for (const id of scoreErrors(ft)) errors.push(t('set.field.errWeights', { type: agentTypes.find((a) => a.id === id)?.name[org.language] ?? id }));

  return (
    <SettingsFrame page="fieldTeam" {...bind(d)} errors={errors}>
      <Section title={t('set.field.agentTypes')} description={t('set.field.agentTypesHint')}>
        <div className="space-y-2">
          {agentTypes.map((a) => (
            <div key={a.id} className="rounded-card border border-line">
              <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="font-medium text-ink">{a.name[org.language] ?? a.name.en ?? a.code}</span>
                <span className="font-mono text-[12px] text-muted">{a.code} · {t('set.field.tiles', { count: a.mobileTiles.length })}</span>
              </button>
              {open === a.id && (
                <div className="space-y-5 border-t border-line p-4">
                  <Grid>
                    <Mini label={t('set.field.typeName')}><LangInputs label={t('set.field.typeName')} value={a.name} onChange={(name) => setAt(a.id, { name })} languages={langs} /></Mini>
                    <Grid>
                      <Mini label={t('set.field.code')}><TextInput value={a.code} className="font-mono uppercase" onChange={(code) => setAt(a.id, { code: code.toUpperCase() })} /></Mini>
                      <Mini label={t('set.field.visibility')}>
                        <Select value={a.visibility ?? 'AREAS'} onChange={(visibility) => setAt(a.id, { visibility })} options={(['OWN', 'AREAS', 'ALL'] as const).map((x) => ({ value: x, label: t(`set.field.visibilityName.${x}`) }))} />
                      </Mini>
                    </Grid>
                    <Mini label={t('set.field.scoreModel')}><TextInput value={a.scoreModel ?? ''} placeholder={t('set.field.scoreModelHint')} onChange={(scoreModel) => setAt(a.id, { scoreModel })} /></Mini>
                    <Mini label={t('set.field.rateCard')}><TextInput value={a.rateCard ?? ''} placeholder={t('set.field.rateCardHint')} onChange={(rateCard) => setAt(a.id, { rateCard })} /></Mini>
                    <Mini label={t('set.field.requiredFields')} className="md:col-span-2"><ChipsInput label={t('set.field.requiredFields')} values={a.requiredFields ?? []} onChange={(requiredFields) => setAt(a.id, { requiredFields })} placeholder={t('set.field.requiredFieldsHint')} /></Mini>
                  </Grid>
                  <Rows>
                    <SwitchRow label={t('set.field.budgetEligible')} description={t('set.field.budgetEligibleHint')} checked={a.budgetEligible} onChange={(budgetEligible) => setAt(a.id, { budgetEligible })} />
                  </Rows>
                  <div className="flex justify-end">
                    <Button variant="dangerOutline" size="sm" onClick={() => d.set('agentTypes', agentTypes.filter((x) => x.id !== a.id))}>{t('set.field.removeType')}</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <AddRow onClick={() => { const id = uid('at'); d.set('agentTypes', [...agentTypes, { id, code: 'NEW', name: { [org.language]: t('set.field.newType') }, budgetEligible: false, mobileTiles: TILES.slice(0, 2).map((x) => x.key), visibility: 'AREAS' }]); setOpen(id); }}>{t('set.field.addType')}</AddRow>
        </div>
      </Section>

      <Section title={t('set.field.plans')}>
        <Grid cols={4}>
          <Mini label={t('set.field.minDays')}><NumberInput value={ft.plan.minDays} min={1} max={7} onChange={(v) => setFt({ plan: { ...ft.plan, minDays: Math.round(v) } })} /></Mini>
          <Mini label={t('set.field.maxDays')}><NumberInput value={ft.plan.maxDays} min={1} max={7} onChange={(v) => setFt({ plan: { ...ft.plan, maxDays: Math.round(v) } })} /></Mini>
          <Mini label={t('set.field.ahead')}><NumberInput value={ft.plan.planAheadWeeks} min={0} max={8} onChange={(v) => setFt({ plan: { ...ft.plan, planAheadWeeks: Math.round(v) } })} /></Mini>
          <Mini label={t('set.field.levels')}><NumberInput value={ft.reportingLevels} min={1} max={6} onChange={(v) => setFt({ reportingLevels: Math.round(v) })} /></Mini>
        </Grid>
      </Section>

      <Section title={t('set.field.costs')} description={t('set.field.costsHint')}>
        <EditTable head={[t('set.field.category'), t('set.field.perDay'), t('set.field.perWeek'), t('set.field.receipt'), '']}>
          {ft.costCategories.map((c) => (
            <tr key={c.id}>
              <td><TextInput value={c.name} onChange={(name) => listEdit('costCategories', c.id, { name })} aria-label={t('set.field.category')} /></td>
              <td className="w-44"><MoneyInput minor={c.maxPerDayMinor} currency={org.currency} onChange={(maxPerDayMinor) => listEdit('costCategories', c.id, { maxPerDayMinor })} aria-label={t('set.field.perDay')} /></td>
              <td className="w-44"><MoneyInput minor={c.maxPerWeekMinor} currency={org.currency} onChange={(maxPerWeekMinor) => listEdit('costCategories', c.id, { maxPerWeekMinor })} aria-label={t('set.field.perWeek')} /></td>
              <td className="w-24"><Switch checked={c.receiptRequired} onCheckedChange={(receiptRequired) => listEdit('costCategories', c.id, { receiptRequired })} aria-label={t('set.field.receipt')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => listRemove('costCategories', c.id)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => setFt({ costCategories: [...ft.costCategories, { id: uid('cc'), name: '', maxPerDayMinor: 0, maxPerWeekMinor: 0, receiptRequired: true }] })}>{t('set.field.addCategory')}</AddRow></div>
      </Section>

      <FieldTeamExtras ft={ft} setFt={setFt} agentTypes={agentTypes} />

      <Section title={t('set.field.penalties')} description={t('set.field.penaltiesHint')}>
        <Rows>
          <SwitchRow label={t('set.field.carryForward')} description={t('set.field.carryForwardHint')} checked={ft.carryForward} onChange={(carryForward) => setFt({ carryForward })} />
        </Rows>
        <EditTable className="mt-4" head={[t('set.field.from'), t('set.field.to'), t('set.field.penalty'), '']}>
          {ft.penaltyBands.map((b) => (
            <tr key={b.id}>
              <td className="w-36"><NumberInput value={b.fromPct} min={0} max={100} suffix="%" onChange={(fromPct) => listEdit('penaltyBands', b.id, { fromPct })} aria-label={t('set.field.from')} /></td>
              <td className="w-36"><NumberInput value={b.toPct} min={0} max={100} suffix="%" onChange={(toPct) => listEdit('penaltyBands', b.id, { toPct })} aria-label={t('set.field.to')} /></td>
              <td className="w-36"><NumberInput value={b.penaltyPct} min={0} max={100} suffix="%" onChange={(penaltyPct) => listEdit('penaltyBands', b.id, { penaltyPct })} aria-label={t('set.field.penalty')} /></td>
              <td className="text-[13px] text-muted">{t('set.field.bandExplain', { from: b.fromPct, to: b.toPct, penalty: b.penaltyPct })}</td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => listRemove('penaltyBands', b.id)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => setFt({ penaltyBands: [...ft.penaltyBands, { id: uid('pb'), fromPct: 100, toPct: 120, penaltyPct: 0 }] })}>{t('set.field.addBand')}</AddRow></div>
      </Section>

      <Section title={t('set.field.allowances')}>
        <EditTable head={[t('set.field.allowance'), t('set.field.amount'), t('set.field.frequency'), t('set.field.threshold'), t('set.field.needsApproval'), '']}>
          {ft.allowanceTypes.map((a) => (
            <tr key={a.id}>
              <td><TextInput value={a.name} onChange={(name) => listEdit('allowanceTypes', a.id, { name })} aria-label={t('set.field.allowance')} /></td>
              <td className="w-44"><MoneyInput minor={a.amountMinor} currency={org.currency} onChange={(amountMinor) => listEdit('allowanceTypes', a.id, { amountMinor })} aria-label={t('set.field.amount')} /></td>
              <td className="w-40"><Select value={a.frequency} onChange={(frequency) => listEdit('allowanceTypes', a.id, { frequency })} options={(['WEEKLY', 'MONTHLY'] as const).map((x) => ({ value: x, label: t(`set.freq.${x}`) }))} aria-label={t('set.field.frequency')} /></td>
              <td className="w-32"><NumberInput value={a.thresholdPct} min={0} max={100} suffix="%" onChange={(thresholdPct) => listEdit('allowanceTypes', a.id, { thresholdPct })} aria-label={t('set.field.threshold')} /></td>
              <td className="w-24"><Switch checked={a.approval} onCheckedChange={(approval) => listEdit('allowanceTypes', a.id, { approval })} aria-label={t('set.field.needsApproval')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => listRemove('allowanceTypes', a.id)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => setFt({ allowanceTypes: [...ft.allowanceTypes, { id: uid('al'), name: '', amountMinor: 0, frequency: 'MONTHLY', thresholdPct: 0, approval: true }] })}>{t('set.field.addAllowance')}</AddRow></div>
        <Mini label={t('set.field.unused')} className="mt-5"><ChipsInput label={t('set.field.unused')} values={ft.unusedReasons} onChange={(unusedReasons) => setFt({ unusedReasons })} /></Mini>
      </Section>

      <Section title={t('set.field.issues')} description={t('set.field.issuesHint')}>
        <EditTable head={[t('set.field.issue'), t('set.field.severity'), t('set.field.consequence'), '']}>
          {ft.issueCategories.map((c) => (
            <tr key={c.id}>
              <td><TextInput value={c.name} onChange={(name) => listEdit('issueCategories', c.id, { name })} aria-label={t('set.field.issue')} /></td>
              <td className="w-40"><Select value={c.severity} onChange={(severity) => listEdit('issueCategories', c.id, { severity })} options={(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((x) => ({ value: x, label: t(`rep.severity.${x}`) }))} aria-label={t('set.field.severity')} /></td>
              <td className="w-56"><Select value={c.consequence} onChange={(consequence) => listEdit('issueCategories', c.id, { consequence })} options={(['FLAG', 'BLOCK_PAYOUTS', 'BLOCK_BUDGETS', 'EXTRA_APPROVAL'] as const).map((x) => ({ value: x, label: t(`set.field.consequenceName.${x}`) }))} aria-label={t('set.field.consequence')} /></td>
              <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => listRemove('issueCategories', c.id)} /></td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3"><AddRow onClick={() => setFt({ issueCategories: [...ft.issueCategories, { id: uid('ic'), name: '', severity: 'MEDIUM', consequence: 'FLAG' }] })}>{t('set.field.addIssue')}</AddRow></div>
      </Section>
    </SettingsFrame>
  );
}
