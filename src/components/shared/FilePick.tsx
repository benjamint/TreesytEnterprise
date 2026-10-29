import { Button } from '@/components/ui/button';
import { Field } from '@/components/shared/Field';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/** File picker that keeps the file name (the prototype stores names only), with a sample shortcut. */
export function FilePick({ label, value, onChange, sample }: { label: string; value?: string; onChange: (v?: string) => void; sample: string }) {
  const { t } = useT();
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line p-2.5">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-ctl bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-canvas">
          {t('sales.chooseFile')}
          <input type="file" className="sr-only" aria-label={label} onChange={(e) => { onChange(e.target.files?.[0]?.name); e.target.value = ''; }} />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(sample)}>{t('sales.useSample')}</Button>
        <span className={cn('text-[13px]', value ? 'text-ink' : 'text-muted')}>{value ?? t('sales.noFile')}</span>
      </div>
    </Field>
  );
}
