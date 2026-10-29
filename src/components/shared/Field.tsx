import { useId, useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/** Label above, helper or error below (PRD 6.1): 13px label (uppercase in the phone app), 13px helper/error. */
export function Field({ label, helper, error, htmlFor, children, className }: { label: ReactNode; helper?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger" role="alert">{error}</p>
      ) : helper ? (
        <p className="mt-1.5 text-[13px] text-muted">{helper}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; helper?: ReactNode; error?: ReactNode; compact?: boolean };

export const TextField = forwardRef<HTMLInputElement, InputProps>(({ label, helper, error, className, id, compact, ...props }, ref) => {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} helper={helper} error={error} htmlFor={fid} className={className}>
      <Input ref={ref} id={fid} compact={compact} aria-invalid={!!error} className={cn(error && 'border-danger focus-visible:border-danger')} {...props} />
    </Field>
  );
});
TextField.displayName = 'TextField';

export const PasswordField = forwardRef<HTMLInputElement, InputProps & { strength?: number }>(({ label, helper, error, className, id, strength, ...props }, ref) => {
  const auto = useId();
  const fid = id ?? auto;
  const [show, setShow] = useState(false);
  const { t } = useT();
  return (
    <Field label={label} helper={helper} error={error} htmlFor={fid} className={className}>
      <div className="relative">
        <Input ref={ref} id={fid} type={show ? 'text' : 'password'} aria-invalid={!!error} className={cn('pr-12', error && 'border-danger')} {...props} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-chip text-muted hover:text-ink" aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {strength !== undefined && <StrengthMeter score={strength} />}
    </Field>
  );
});
PasswordField.displayName = 'PasswordField';

export function StrengthMeter({ score }: { score: number }) {
  const { t } = useT();
  const tone = ['bg-line', 'bg-danger', 'bg-warning', 'bg-info', 'bg-success'][score]!;
  return (
    <div className="mt-2.5 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-200', i <= score ? tone : 'bg-line')} />
        ))}
      </div>
      {score > 0 && <span className="w-16 text-right text-[12px] font-medium text-muted">{t(`auth.strength.${score}`)}</span>}
    </div>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; helper?: ReactNode; error?: ReactNode; options: { value: string; label: string }[] };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(({ label, helper, error, className, id, options, ...props }, ref) => {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} helper={helper} error={error} htmlFor={fid} className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          className="h-ctl-lg w-full appearance-none rounded-ctl border border-line-strong bg-surface pl-3 pr-10 text-[14px] text-ink shadow-xs transition-shadow hover:border-muted/50 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15 [.mobile-ui_&]:pl-4 [.mobile-ui_&]:text-[16px]"
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>
    </Field>
  );
});
SelectField.displayName = 'SelectField';

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; helper?: ReactNode; error?: ReactNode }>(
  ({ label, helper, error, className, id, ...props }, ref) => {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <Field label={label} helper={helper} error={error} htmlFor={fid} className={className}>
        <textarea
          ref={ref}
          id={fid}
          className="min-h-[112px] w-full rounded-ctl border border-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink shadow-xs placeholder:text-muted hover:border-muted/50 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15 [.mobile-ui_&]:px-4 [.mobile-ui_&]:text-[16px]"
          {...props}
        />
      </Field>
    );
  },
);
TextAreaField.displayName = 'TextAreaField';

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }>(({ label, description, className, ...props }, ref) => (
  <label className={cn('flex cursor-pointer items-start gap-3 text-[14px] text-body', className)}>
    <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
      <input ref={ref} type="checkbox" className="peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border border-line bg-surface transition-colors checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/30" {...props} />
      <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
    </span>
    <span>
      <span className="block">{label}</span>
      {description && <span className="block text-[13px] text-muted">{description}</span>}
    </span>
  </label>
));
Checkbox.displayName = 'Checkbox';

/** Six boxes for a one-time code; paste fills them all. */
export function OtpInput({ value, onChange, length = 6, invalid, autoFocus, label }: { value: string; onChange: (v: string) => void; length?: number; invalid?: boolean; autoFocus?: boolean; label: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const set = (i: number, d: string) => {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, length);
    onChange(next.replace(/\D/g, ''));
  };
  return (
    <div className="flex justify-between gap-2" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`${label} ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (!v) return set(i, '');
            set(i, v[v.length - 1]!);
            refs.current[Math.min(i + 1, length - 1)]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (p) {
              e.preventDefault();
              onChange(p);
              refs.current[Math.min(p.length, length - 1)]?.focus();
            }
          }}
          className={cn(
            'tnum h-ctl-lg w-full min-w-0 rounded-ctl border bg-surface text-center text-[20px] font-semibold text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}
