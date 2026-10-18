import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Step progress header for multi-step forms (PRD 6.2 StepperWizard). */
export function StepperHeader({ steps, current, onStep, compact }: { steps: string[]; current: number; onStep?: (i: number) => void; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3" aria-label={steps[current]}>
        <div className="flex flex-1 gap-1.5">
          {steps.map((s, i) => (
            <span key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-200', i <= current ? 'bg-brand' : 'bg-line')} />
          ))}
        </div>
        <span className="tnum text-[13px] font-medium text-muted">{`${current + 1}/${steps.length}`}</span>
      </div>
    );
  }
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = onStep && i < current;
        return (
          <li key={s}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStep(i)}
              aria-current={active ? 'step' : undefined}
              className={cn('flex w-full items-center gap-3 rounded-ctl px-3 py-2.5 text-left text-[14px] transition-colors', active ? 'bg-brand-soft font-semibold text-brand' : done ? 'text-ink hover:bg-canvas' : 'text-muted')}
            >
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold', active ? 'border-brand bg-brand text-white' : done ? 'border-brand bg-surface text-brand' : 'border-line bg-surface text-muted')}>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function StepTitle({ eyebrow, title, description }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h2 className="text-[26px] leading-tight">{title}</h2>
      {description && <p className="mt-2 text-[15px] text-muted">{description}</p>}
    </div>
  );
}
