import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
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
            <button key={v.key} type="button" role="tab" aria-selected={v.active} onClick={v.onSelect} className={cn('rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors', v.active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-brand/40')}>
              {v.label}
              {v.count != null && <span className={cn('ml-1.5 tnum text-[12px]', v.active ? 'text-on-brand/80' : 'text-muted')}>{v.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input compact value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9" />
        </div>
        {filters.map((f) => (
          <select
            key={f.key}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            aria-label={f.label}
            className={cn('h-11 max-w-[220px] rounded-ctl border bg-surface px-3 text-[14px] focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft', f.value ? 'border-brand/50 text-ink' : 'border-line text-muted')}
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {active && onClear && <Button variant="ghost" size="sm" onClick={onClear}><X /> {t('table.clearFilters')}</Button>}
        {extra}
      </div>
    </div>
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

/** Detail drawer (PRD 6.2): 640 px right sheet with a header and tabs. */
export function DetailDrawer({ open, onClose, title, subtitle, badges, actions, tabs }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode; tabs: DrawerTab[] }) {
  const { t } = useT();
  const [params] = useSearchParams();
  // A link can open the drawer on a given tab (`&tab=`).
  const [tab, setTab] = useState(() => { const want = params.get('tab'); return want && tabs.some((x) => x.key === want) ? want : tabs[0]?.key ?? ''; });
  const current = tabs.find((x) => x.key === tab) ?? tabs[0];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 pb-0 pt-6">
          <div className="pr-10">
            <SheetTitle className="text-[22px] font-semibold leading-tight text-ink">{title}</SheetTitle>
            {subtitle && <SheetDescription className="mt-1 text-[14px] text-muted">{subtitle}</SheetDescription>}
            {badges && <div className="mt-3 flex flex-wrap gap-1.5">{badges}</div>}
            {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
          </div>
          <div className="-mb-px mt-5 flex gap-1 overflow-x-auto scrollbar-thin" role="tablist">
            {tabs.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={x.key === current?.key} onClick={() => setTab(x.key)} className={cn('whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-medium transition-colors', x.key === current?.key ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>
                {x.label}
                {x.count != null && <span className="ml-1.5 tnum text-[12px] text-muted">{x.count}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5" role="tabpanel">{current?.content}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Label / value grid used in drawer overviews. */
export function Facts({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{k}</dt>
          <dd className="mt-0.5 truncate text-[14px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TabEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-ctl border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted">{children}</p>;
}
