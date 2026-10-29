import { useMemo, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useOrgRows, useT } from '@/stores/hooks';

export type AggTab = 'purchases' | 'suppliers' | 'expenses';
const PATHS: Record<AggTab, string> = { purchases: '/app/aggregators', suppliers: '/app/aggregators/suppliers', expenses: '/app/aggregators/expenses' };

/** Purchases · Suppliers · Expenses, each its own URL so drawers deep-link (`?open=`). */
export function AggTabs({ counts }: { counts: Partial<Record<AggTab, number>> }) {
  const { t } = useT();
  return (
    <nav className="mb-5 inline-flex max-w-full overflow-x-auto rounded-ctl border border-line bg-surface p-1 scrollbar-thin" aria-label={t('agg.sections')}>
      {(Object.keys(PATHS) as AggTab[]).map((k) => (
        <NavLink key={k} to={PATHS[k]} end className={({ isActive }) => cn('inline-flex h-9 items-center gap-2 rounded-[8px] px-4 text-[14px] font-medium transition-colors', isActive ? 'bg-brand text-on-brand' : 'text-body hover:bg-canvas')}>
          {t(`agg.tab.${k}`)}
          {counts[k] != null && <span className="tnum rounded-full bg-black/10 px-1.5 text-[12px]">{counts[k]}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export function useSuppliers() {
  const suppliers = useOrgRows(useBuyingStore((s) => s.suppliers));
  return useMemo(() => {
    const byId = new Map(suppliers.map((s) => [s.id, s]));
    return { list: suppliers, get: (id: string): Supplier | undefined => byId.get(id), name: (id: string) => byId.get(id)?.name ?? '—' };
  }, [suppliers]);
}

export function Stat({ label, value, hint, onClick, active }: { label: string; value: string; hint?: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex flex-col items-start justify-start rounded-card border bg-surface p-5 text-left shadow-soft transition-colors', active ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-brand/40')}>
      <div className="eyebrow">{label}</div>
      <div className="tnum mt-2 text-[24px] font-semibold leading-none text-ink">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
    </button>
  );
}

/** A document slot (PO file, weighbridge report, invoice…): upload, or a sample in the prototype. */
export function FileSlot({ label, value, onChange, optional, sample }: { label: ReactNode; value?: string; onChange: (v: string | undefined) => void; optional?: boolean; sample: string }) {
  const { t } = useT();
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-muted">{label}{optional && <span className="ml-1 font-normal normal-case tracking-normal text-muted">{t('agg.optional')}</span>}</div>
      <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line p-2.5">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-ctl bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-canvas">
          {t('agg.upload')}
          <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => { onChange(e.target.files?.[0]?.name); e.target.value = ''; }} />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(sample)}>{t('agg.useSample')}</Button>
        {value ? <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-ink"><FileText className="h-4 w-4 shrink-0 text-brand" />{value}</span> : <span className="text-[13px] text-muted">{optional ? t('agg.noFile') : t('buy.proofRequired')}</span>}
      </div>
    </div>
  );
}

/** Two numbers side by side with a bar each, for money and volume reconciliation. */
export function Bars({ rows, format }: { rows: { label: string; value: number; tone?: 'brand' | 'muted' | 'warning' | 'success' }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="text-body">{r.label}</span><span className="tnum shrink-0 whitespace-nowrap font-medium text-ink">{format(r.value)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas">
            <div className={cn('h-full rounded-full', r.tone === 'muted' ? 'bg-line' : r.tone === 'warning' ? 'bg-warning' : r.tone === 'success' ? 'bg-success' : 'bg-brand')} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
