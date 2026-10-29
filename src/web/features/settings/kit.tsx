import { forwardRef, useEffect, useId, useState, type ReactNode } from 'react';
import { NavLink, useBlocker } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Lang } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { APP_ROUTES, type SettingsPage } from '@/app/routes';
import { fromMinor, toMinor } from '@/engines/money';
import { cn } from '@/lib/utils';
import { useCurrentOrg, useT } from '@/stores/hooks';
import { pagePermission, useCanEdit } from './draft';
import { useSessionStore } from '@/stores/sessionStore';

interface FrameProps {
  page: SettingsPage;
  dirty?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  onReset?: () => void;
  canReset?: boolean;
  /** Ask before saving (e.g. "12 requests will move to the next step"). */
  saveConfirm?: string | null;
  /** Errors block saving. */
  errors?: string[];
  /** Header actions next to Save (e.g. "Invite"). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Every settings page: title, Save (toast + audit), Cancel, Reset to template, read-only for people
 * without the edit permission, a guard against leaving with unsaved changes, and "Where this is used".
 */
export function SettingsFrame({ page, dirty = false, onSave, onCancel, onReset, canReset, saveConfirm, errors = [], actions, children }: FrameProps) {
  const { t } = useT();
  const org = useCurrentOrg();
  const canEdit = useCanEdit(page);
  const viewAs = useSessionStore((s) => s.viewAs);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  const usedBy = APP_ROUTES.filter((r) => r.configurable?.includes(page));
  const editable = !!onSave;
  const blocked = errors.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const doSave = () => {
    onSave?.();
    setConfirmSave(false);
    toast.success(t('set.frame.saved', { page: t(`settings.page.${page}`) }), { description: t('set.frame.savedBody') });
  };
  const trySave = () => (saveConfirm ? setConfirmSave(true) : doSave());

  const saveButton = (
    <Button onClick={trySave} disabled={!dirty || blocked || !canEdit}>
      <Save /> {t('common.save')}
    </Button>
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[24px] leading-tight">{t(`settings.page.${page}`)}</h2>
            {!canEdit && (
              <Badge tone="neutral">
                <Lock className="h-3 w-3" /> {t('set.frame.viewOnly')}
              </Badge>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-muted">{t(`settings.pageDesc.${page}`, { company: org.name })}</p>
        </div>
        {(editable || actions) && (canEdit || viewAs) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions}
            {editable && onReset && (
              <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={!canReset || !canEdit}>
                <RotateCcw /> {t('set.frame.reset')}
              </Button>
            )}
            {editable && (
              <Button variant="secondary" onClick={onCancel} disabled={!dirty}>
                {t('common.cancel')}
              </Button>
            )}
            {editable && (canEdit ? saveButton : <Tip label={t('common.missingPermission', { permission: pagePermission(page) })}><span tabIndex={0}>{saveButton}</span></Tip>)}
          </div>
        )}
      </div>

      {blocked && dirty && (
        <ul className="space-y-1 rounded-ctl border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <fieldset disabled={!canEdit} className="min-w-0 space-y-10">
        {children}
      </fieldset>

      {usedBy.length > 0 && (
        <section className="border-t border-line pt-6">
          <div className="eyebrow mb-3">{t('set.frame.usedBy')}</div>
          <div className="flex flex-wrap gap-2">
            {usedBy.map((r) => (
              <NavLink key={r.key} to={r.path} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink hover:border-brand/40">
                <r.icon className="h-3.5 w-3.5 text-muted" /> {t(`nav.${r.key}`)}
              </NavLink>
            ))}
          </div>
        </section>
      )}

      <AnimatePresence>
        {dirty && canEdit && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-card border border-line bg-ink px-5 py-3 text-surface shadow-lift dark:bg-surface dark:text-ink"
            role="status"
          >
            <span className="text-[14px] font-medium">{t('set.frame.unsaved')}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-surface hover:bg-white/10 dark:text-ink" onClick={onCancel}>
                {t('set.frame.discard')}
              </Button>
              <Button size="sm" onClick={trySave} disabled={blocked}>
                <Save /> {t('set.frame.saveChanges')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={t('set.frame.confirmSave')}
        body={saveConfirm ?? ''}
        confirm={t('common.save')}
        onConfirm={doSave}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('set.frame.resetTitle', { page: t(`settings.page.${page}`) })}
        body={t('set.frame.resetBody')}
        confirm={t('set.frame.reset')}
        onConfirm={() => {
          onReset?.();
          setConfirmReset(false);
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title={t('set.frame.leaveTitle')}
        body={t('set.frame.leaveBody')}
        confirm={t('set.frame.discard')}
        danger
        onConfirm={() => {
          onCancel?.();
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, body, confirm, onConfirm, danger, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; body?: ReactNode; confirm: ReactNode; onConfirm: () => void; danger?: boolean; children?: ReactNode }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A titled block inside a settings page. */
export function Section({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 max-w-2xl text-[14px] text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Label + description on the left, a switch on the right. */
export function SwitchRow({ label, description, checked, onChange, disabled }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Small labelled control used in dense editors. */
export function Mini({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>>(
  ({ value, onChange, className, ...props }, ref) => <Input ref={ref} compact value={value} onChange={(e) => onChange(e.target.value)} className={className} {...props} />,
);
TextInput.displayName = 'TextInput';

export function NumberInput({ value, onChange, suffix, step, min, max, className, ...props }: { value: number; onChange: (v: number) => void; suffix?: string; step?: number; min?: number; max?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'step' | 'min' | 'max'>) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className={cn('relative', className)}>
      <Input
        compact
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        min={min}
        max={max}
        value={text ?? String(value)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(null)}
        className={cn('tnum', suffix && 'pr-12')}
        {...props}
      />
      {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-muted">{suffix}</span>}
    </div>
  );
}

/** Edits an amount in minor units, shown in major units of the company currency. */
export function MoneyInput({ minor, currency, onChange, className, ...props }: { minor: number; currency: string; onChange: (minor: number) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'step' | 'min' | 'max'>) {
  return <NumberInput value={fromMinor(minor, currency)} onChange={(v) => onChange(toMinor(v, currency))} suffix={currency} min={0} className={className} {...props} />;
}

export function Select<V extends string>({ value, onChange, options, className, ...props }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
      className={cn('h-ctl w-full min-w-0 rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft disabled:opacity-60', className)}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Pill buttons for a small set of choices. */
export function Segmented<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-ctl border border-line bg-canvas p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60', value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Free-text tags: type and press Enter. */
export function ChipsInput({ values, onChange, placeholder, label }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const [text, setText] = useState('');
  const { t } = useT();
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  return (
    <div className="flex min-h-ctl flex-wrap items-center gap-1.5 rounded-ctl border border-line bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[13px] text-ink">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={t('set.kit.removeItem', { item: v })} className="text-muted hover:text-danger">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
        placeholder={values.length ? '' : placeholder}
        className="min-w-[120px] flex-1 bg-transparent px-1.5 py-1 text-[14px] text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

/** One input per company language (EN / FR). */
export function LangInputs({ value, onChange, languages, multiline, label }: { value: Partial<Record<Lang, string>>; onChange: (v: Partial<Record<Lang, string>>) => void; languages: Lang[]; multiline?: boolean; label: string }) {
  return (
    <div className={cn('grid gap-2', languages.length > 1 && !multiline && 'sm:grid-cols-2')}>
      {languages.map((l) => (
        <div key={l} className="relative">
          <span className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted">{l}</span>
          {multiline ? (
            <textarea
              aria-label={`${label} (${l.toUpperCase()})`}
              value={value[l] ?? ''}
              onChange={(e) => onChange({ ...value, [l]: e.target.value })}
              rows={3}
              className="w-full rounded-ctl border border-line bg-surface py-2.5 pl-12 pr-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft disabled:opacity-60"
            />
          ) : (
            <Input compact aria-label={`${label} (${l.toUpperCase()})`} value={value[l] ?? ''} onChange={(e) => onChange({ ...value, [l]: e.target.value })} className="pl-12" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Plain bordered table for editors (not a data list: no sorting or paging). */
export function EditTable({ head, children, empty, className }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-ctl border border-line', className)}>
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="bg-canvas text-left">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 text-[12px] font-medium text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function RowDelete({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Tip label={label}>
      <Button variant="ghost" size="iconSm" onClick={onClick} aria-label={label} className="text-muted hover:text-danger">
        <Trash2 />
      </Button>
    </Tip>
  );
}

export function AddRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <Plus /> {children}
    </Button>
  );
}

/** Two-column grid of fields. */
export function Grid({ children, cols = 2, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-5', cols === 2 && 'md:grid-cols-2', cols === 3 && 'md:grid-cols-3', cols === 4 && 'md:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}

/** Bordered card holding a group of switch rows. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line rounded-ctl border border-line px-5">{children}</div>;
}
