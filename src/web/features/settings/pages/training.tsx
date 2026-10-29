import type { TrainingRules } from '@/types';
import { useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { Grid, Mini, NumberInput, Section, SettingsFrame, SwitchRow } from '../kit';

const KEYS = ['training'] as const;

/** Workshops and training (PRD G3): edit / delete rules, attendance eligibility, commission bounds (J9). */
export function TrainingPage() {
  const d = useSettingsDraft('training', KEYS);
  const { t } = useT();
  const s = d.value.training;
  const set = (patch: Partial<TrainingRules>) => d.set('training', { ...s, ...patch });
  const errors = s.minForCommission > s.maxForCommission ? [t('set.training.errBounds')] : [];
  return (
    <SettingsFrame page="training" {...bind(d)} errors={errors}>
      <Section title={t('set.training.edit')} description={t('set.training.editHint')}>
        <Grid cols={2}>
          <Mini label={t('set.training.editHeldDays')}><NumberInput value={s.editHeldDays} min={0} max={30} suffix={t('set.sales.daysUnit')} onChange={(v) => set({ editHeldDays: v })} aria-label={t('set.training.editHeldDays')} /></Mini>
        </Grid>
        <div className="mt-4 space-y-1">
          <SwitchRow label={t('set.training.deletePlannedOnly')} description={t('set.training.deletePlannedOnlyHint')} checked={s.deletePlannedOnly} onChange={(v) => set({ deletePlannedOnly: v })} />
        </div>
      </Section>
      <Section title={t('set.training.attendance')} description={t('set.training.attendanceHint')}>
        <div className="space-y-1">
          <SwitchRow label={t('set.training.membersOnly')} description={t('set.training.membersOnlyHint')} checked={s.membersOnly} onChange={(v) => set({ membersOnly: v })} />
          <SwitchRow label={t('set.training.allowGuests')} description={t('set.training.allowGuestsHint')} checked={s.allowGuests} onChange={(v) => set({ allowGuests: v })} />
          <SwitchRow label={t('set.training.ratingRequired')} description={t('set.training.ratingRequiredHint')} checked={s.ratingRequired} onChange={(v) => set({ ratingRequired: v })} />
        </div>
      </Section>
      <Section title={t('set.training.commission')} description={t('set.training.commissionHint')}>
        <Grid cols={2}>
          <Mini label={t('set.training.min')}><NumberInput value={s.minForCommission} min={0} onChange={(v) => set({ minForCommission: v })} aria-label={t('set.training.min')} /></Mini>
          <Mini label={t('set.training.max')}><NumberInput value={s.maxForCommission} min={1} onChange={(v) => set({ maxForCommission: v })} aria-label={t('set.training.max')} /></Mini>
        </Grid>
      </Section>
    </SettingsFrame>
  );
}
