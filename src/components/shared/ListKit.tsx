import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';
import { useListUiStore } from '@/stores/listUiStore';

export interface FilterDef {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

export interface SavedView {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
  count?: number;
}

/** FilterBar (PRD 6.2): search, filters, saved views, clear. */
export function FilterBar({ search, onSearch, placeholder, filters = [], views = [], onClear, extra }: { search: string; onSearch: (v: string) => void; placeholder: string; filters?: FilterDef[]; views?: SavedView[]; onClear?: () => void; extra?: ReactNode }) {
  const { t } = useT();
  const active = !!search || filters.some((f) => f.value);
  const setCount = filters.filter((f) => f.value).length;
  const { pathname } = useLocation();
  const clearRef = useRef(onClear);
  clearRef.current = onClear;
  useEffect(() => {
    useListUiStore.getState().set(pathname, active, () => clearRef.current?.());
  }, [pathname, active]);
  useEffect(() => () => useListUiStore.getState().set('', false), []);
  return (
    <div className="mb-4 space-y-3" data-tour="filter-bar">
      {views.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('table.views')}>
          {views.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={v.active} onClick={v.onSelect} className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors', v.active ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-surface text-body shadow-xs hover:bg-subtle hover:text-ink')}>
              {v.label}
              {v.count != null && <span className={cn('ml-1.5 tnum text-[12px]', v.active ? 'text-brand' : 'text-muted')}>{v.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-[220px] flex-1 sm:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input compact value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9" />
        </div>
        {filters.length === 1 && <FilterSelect f={filters[0]!} />}
        {filters.length > 1 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" className={cn('h-ctl', setCount > 0 && 'border-brand/40 text-ink')} aria-label={setCount ? `${t('table.filters')} (${setCount})` : t('table.filters')}>
                <SlidersHorizontal /> {t('table.filters')}
                {setCount > 0 && <span className="tnum ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-on-brand">{setCount}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-[13px] font-semibold text-ink">{t('table.filters')}</span>
                {setCount > 0 && <button type="button" onClick={() => filters.forEach((f) => f.onChange(''))} className="text-[12px] font-medium text-muted hover:text-ink">{t('table.clearFilters')}</button>}
              </div>
              <div className="space-y-3 p-4">
                {filters.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1 block text-[12px] font-medium text-muted">{f.label}</span>
                    <FilterSelect f={f} full />
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {active && onClear && <Button variant="ghost" size="sm" onClick={onClear}><X /> {t('table.clearFilters')}</Button>}
        {extra}
      </div>
      {filters.length > 1 && setCount > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('table.filters')}>
          {filters.filter((f) => f.value).map((f) => (
            <li key={f.key}>
              <button type="button" onClick={() => f.onChange('')} aria-label={t('table.removeFilter', { name: `${f.label}: ${f.options.find((o) => o.value === f.value)?.label ?? f.value}` })}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft/60 pl-2.5 pr-1.5 text-[12px] text-ink transition-colors hover:bg-brand-soft">
                <span className="text-muted">{f.label}</span>
                <span className="font-medium">{f.options.find((o) => o.value === f.value)?.label ?? f.value}</span>
                <X className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterSelect({ f, full }: { f: FilterDef; full?: boolean }) {
  return (
    <select
      value={f.value}
      onChange={(e) => f.onChange(e.target.value)}
      aria-label={f.label}
      className={cn('h-ctl min-w-0 rounded-ctl border bg-surface px-2.5 text-[14px] shadow-xs hover:border-muted/50 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15', full ? 'w-full' : 'flex-1 sm:max-w-[220px] sm:flex-none', f.value ? 'border-brand/50 text-ink' : 'border-line-strong text-body')}
    >
      <option value="">{f.label}</option>
      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** `?open=<id>` drives the detail drawer, so links from the dashboard and AI answers open it. */
export function useDrawerParam(key = 'open') {
  const [params, setParams] = useSearchParams();
  const id = params.get(key);
  const open = useCallback((v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(key, v); n.delete('tab'); return n; }), [setParams, key]);
  const close = useCallback(() => setParams((p) => { const n = new URLSearchParams(p); n.delete(key); n.delete('tab'); return n; }, { replace: true }), [setParams, key]);
  return [id, open, close] as const;
}

export interface DrawerTab {
  key: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/**
 * Detail drawer (PRD 6.2): 640 px floating right sheet with a header, tabs and a fixed action bar.
 * The bar groups whatever buttons a page passes: tertiary (ghost) on the left; secondary, then
 * destructive, then the primary action on the right; status banners on their own row above.
 */
export function DetailDrawer({ open, onClose, title, subtitle, badges, actions, tabs }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode; tabs: DrawerTab[] }) {
  const { t } = useT();
  const [params] = useSearchParams();
  // A link can open the drawer on a given tab (`&tab=`).
  const [tab, setTab] = useState(() => { const want = params.get('tab'); return want && tabs.some((x) => x.key === want) ? want : tabs[0]?.key ?? ''; });
  const current = tabs.find((x) => x.key === tab) ?? tabs[0];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-7 pb-0 pt-6">
          <div className="pr-10">
            <SheetTitle className="font-display text-[24px] leading-tight text-ink">{title}</SheetTitle>
            {subtitle && <SheetDescription className="mt-1 text-[13px] text-muted">{subtitle}</SheetDescription>}
            {badges && <div className="mt-3 flex flex-wrap items-center gap-1.5">{badges}</div>}
          </div>
          <div className="-mb-px mt-5 flex gap-5 overflow-x-auto scrollbar-thin" role="tablist">
            {tabs.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={x.key === current?.key} onClick={() => setTab(x.key)} className={cn('whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-[14px] font-medium transition-colors', x.key === current?.key ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
                {x.label}
                {x.count != null && <span className={cn('ml-1.5 rounded-full px-1.5 py-px tnum text-[11px]', x.key === current?.key ? 'bg-brand-soft text-brand' : 'bg-canvas text-muted')}>{x.count}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6 scrollbar-thin" role="tabpanel">{current?.content}</div>
        {actions && <div className="drawer-actions" role="group" aria-label={t('common.actions')}>{actions}</div>}
      </SheetContent>
    </Sheet>
  );
}

/** Bordered label / value grid: each fact in its own cell, hairlines between (drawer overviews). */
export const factsGrid = (cols: 1 | 2 | 3 = 2) => cn('grid gap-px overflow-hidden rounded-ctl border border-line bg-line', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3');
export const factCell = 'min-w-0 bg-surface px-4 py-3';
export const factLabel = 'text-[12px] font-medium text-muted';
export const factValue = 'mt-1 break-words text-[14px] text-ink';

export function Facts({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 2 | 3 }) {
  // Empty cells fill the last row so the grid's hairline background never shows through.
  const fillers = (cols - (items.length % cols)) % cols;
  return (
    <dl className={factsGrid(cols)}>
      {items.map(([k, v], i) => (
        <div key={i} className={factCell}>
          <dt className={factLabel}>{k}</dt>
          <dd className={factValue}>{v}</dd>
        </div>
      ))}
      {Array.from({ length: fillers }, (_, i) => <div key={`f${i}`} className="hidden bg-surface sm:block" aria-hidden="true" />)}
    </dl>
  );
}

export function TabEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-ctl border border-dashed border-line-strong bg-subtle px-4 py-8 text-center text-[13px] text-muted">{children}</p>;
}
