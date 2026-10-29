import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/** Mobile building blocks (PRD 10 common components): 48 px targets, step progress, sticky action. */

export interface WizardStep { key: string; title: string; content: ReactNode; valid?: boolean; hint?: ReactNode }

/** Step-by-step flow with a progress bar and a sticky Next / finish button. */
export function MobileWizard({ steps, finishLabel, onFinish, busy, step: controlled, onStep }: {
  steps: WizardStep[]; finishLabel: string; onFinish: () => void; busy?: boolean; step?: number; onStep?: (i: number) => void;
}) {
  const { t } = useT();
  const [own, setOwn] = useState(0);
  const i = Math.min(controlled ?? own, steps.length - 1);
  const go = (n: number) => { (onStep ?? setOwn)(n); document.getElementById('mwiz-top')?.scrollIntoView(); };
  const step = steps[i]!;
  const last = i === steps.length - 1;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-3 pt-1">
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink">{step.title}</span>
          <span className="tnum text-muted">{t('mobile.form.step', { n: i + 1, total: steps.length })}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div id="mwiz-top" />
        {step.content}
      </div>
      <div className="shrink-0 border-t border-line/70 bg-surface/90 p-4 backdrop-blur-xl frame:pb-7">
        {step.hint && <div className="mb-2 text-center text-[13px] text-muted">{step.hint}</div>}
        <div className="flex gap-2">
          {i > 0 && <Button size="lg" variant="secondary" onClick={() => go(i - 1)} aria-label={t('mobile.back')} disabled={busy}><ArrowLeft /></Button>}
          <Button size="lg" className="flex-1" disabled={step.valid === false || busy} onClick={() => (last ? onFinish() : go(i + 1))}>{last ? finishLabel : t('mobile.form.next')}</Button>
        </div>
      </div>
    </div>
  );
}

/** A labelled field. `group` is for compound controls (capture buttons, segmented): a <div>, not a <label>. */
export function MField({ label, required, children, error, help, group }: { label: ReactNode; required?: boolean; children: ReactNode; error?: ReactNode; help?: ReactNode; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block">
      <span className="mb-1.5 block text-[15px] font-medium text-ink">{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
      {help && !error && <span className="mt-1 block text-[13px] text-muted">{help}</span>}
      {error && <span className="mt-1 block text-[13px] text-danger" role="alert">{error}</span>}
    </Tag>
  );
}

export const mInput = 'h-12 w-full rounded-ctl border border-line-strong bg-surface px-4 text-[16px] text-ink shadow-xs placeholder:text-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15';

export function MSelect<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as V)} aria-label={label} className={mInput}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Segmented<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; label: string }) {
  return (
    <div className="flex h-14 items-center gap-1 rounded-ctl border border-line bg-canvas p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn('h-full flex-1 rounded-[11px] px-2 text-[15px] font-medium transition-colors', value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>{o.label}</button>
      ))}
    </div>
  );
}

export function ListRow({ title, subtitle, right, onClick, badge }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onClick?: () => void; badge?: ReactNode }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><span className="truncate font-medium text-ink">{title}</span>{badge}</span>
        {subtitle && <span className="block truncate text-[13px] text-muted">{subtitle}</span>}
      </span>
      {right}
      {onClick && <ChevronRight className="h-5 w-5 shrink-0 text-muted/70" aria-hidden="true" />}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-brand-soft">{body}</button>
    : <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">{body}</div>;
}

export function MList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">{children}</ul>;
}

export function MSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={mInput} />;
}

/** "Saved on phone · will sync" vs "Saved" toast text key for a saveOrQueue result. */
export const savedKey = (queued: boolean) => (queued ? 'mobile.savedOffline' : 'mobile.savedOnline');
