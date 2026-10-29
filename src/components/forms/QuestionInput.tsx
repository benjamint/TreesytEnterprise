import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from 'lucide-react';
import type { Option, Question } from '@/engines/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLocationStore } from '@/stores/locationStore';
import { useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { AudioCapture, GpsCapture, PhotoPicker, PolygonCapture, SignaturePad, SimCapture, type Gps, type Polygon } from './media';

type Answers = Record<string, unknown>;
export const qLabel = (q: { label: Question['label'] }, lang: 'en' | 'fr') => q.label[lang] ?? q.label.en ?? q.label.fr ?? '';
export const optLabel = (o: Option, lang: 'en' | 'fr') => o.label[lang] ?? o.label.en ?? o.value;
export const OTHER = '__other';

const field = 'w-full rounded-ctl border border-line bg-surface text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft';

/** Stable shuffle per question, so "randomise" doesn't reorder on every keystroke. */
function shuffled(options: Option[], seed: string): Option[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...options];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Where simulated GPS lands: the company's first community. */
function useBaseGps() {
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  return communities[0]?.gps ?? { lat: 9.4, lng: -0.85 };
}

/**
 * One input per question type (PRD G1, 37 types). `big` gives the mobile sizes: 48 px targets,
 * radio lists instead of drop-downs, larger capture buttons.
 */
export function QuestionInput({ q, value, onChange, invalid, big, answers = {}, otherText, onOtherText }: {
  q: Question; value: unknown; onChange: (v: unknown) => void; invalid?: boolean; big?: boolean; answers?: Answers; otherText?: string; onOtherText?: (v: string) => void;
}) {
  const lang = useLang();
  const { t } = useT();
  const base = useBaseGps();
  const aria = qLabel(q, lang);
  const h = big ? 'h-12 text-[16px]' : 'h-ctl text-[14px]';
  const inv = invalid && 'border-danger';
  const options = useMemo(() => (q.randomise ? shuffled(q.options ?? [], q.id) : q.options ?? []), [q.options, q.randomise, q.id]);
  const placeholder = q.placeholder?.[lang] ?? q.placeholder?.en;
  const text = (type: string, extra: Record<string, unknown> = {}) => (
    <Input compact={!big} type={type} value={value == null ? '' : String(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} className={cn(big && 'h-12 text-[16px]', inv)} aria-label={aria} aria-invalid={invalid} {...extra} />
  );
  const scaleButtons = (values: number[], labelOf?: (v: number) => string) => (
    <div className={cn('flex flex-wrap gap-1.5', big && 'gap-2')} role="radiogroup" aria-label={aria}>
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(value === v ? undefined : v)}
          className={cn('min-w-10 rounded-ctl border px-2.5 font-medium tnum transition-colors', big ? 'h-12 min-w-12 text-[16px]' : 'h-10 text-[14px]', value === v ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-body hover:border-brand/50')}>
          {labelOf ? labelOf(v) : v}
        </button>
      ))}
    </div>
  );

  switch (q.type) {
    case 'shortText': return text('text');
    case 'email': return text('email');
    case 'phone': return text('tel', { inputMode: 'tel' });
    case 'number':
    case 'decimal':
    case 'currency':
    case 'year':
      return <Input compact={!big} type="number" step={q.type === 'decimal' || q.type === 'currency' ? 'any' : 1} inputMode={q.type === 'decimal' ? 'decimal' : 'numeric'} value={value == null ? '' : String(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={cn('tnum', big && 'h-12 text-[16px]', inv)} aria-label={aria} aria-invalid={invalid} />;
    case 'date': return text('date');
    case 'time': return text('time');
    case 'dateTime': return text('datetime-local');
    case 'monthYear': return text('month');
    case 'longText':
      return <textarea value={String(value ?? '')} placeholder={placeholder} onChange={(e) => onChange(e.target.value || undefined)} rows={big ? 4 : 3} aria-label={aria} className={cn(field, 'p-3', big ? 'text-[16px]' : 'text-[14px]', inv)} />;
    case 'yesNo':
      return (
        <div className={cn('flex items-center gap-1 rounded-ctl border border-line bg-canvas p-1', big ? 'h-14' : 'h-ctl', inv)} role="radiogroup" aria-label={aria}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn('h-full flex-1 rounded-[8px] font-medium', big ? 'text-[16px]' : 'text-[13px]', value === v ? 'bg-surface text-ink shadow-soft' : 'text-muted')}>
              {t(v ? 'common.yes' : 'common.no')}
            </button>
          ))}
        </div>
      );
    case 'selectOne': {
      const other = q.other && (
        <Input compact={!big} value={otherText ?? ''} onChange={(e) => onOtherText?.(e.target.value)} placeholder={t('form.otherPlaceholder')} aria-label={t('form.other')} className={cn('mt-2', big && 'h-12')} />
      );
      if (big || options.length <= 4) {
        return (
          <div>
            <div className="space-y-1.5" role="radiogroup" aria-label={aria}>
              {[...options, ...(q.other ? [{ value: OTHER, label: { en: t('form.other'), fr: t('form.other') } }] : [])].map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(value === o.value ? undefined : o.value)}
                  className={cn('flex w-full items-center gap-3 rounded-ctl border px-3 text-left', big ? 'min-h-12 text-[16px]' : 'min-h-10 text-[14px]', value === o.value ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-surface text-body hover:border-brand/40', inv)}>
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', value === o.value ? 'border-brand' : 'border-line')}>{value === o.value && <span className="h-2 w-2 rounded-full bg-brand" />}</span>
                  {optLabel(o, lang)}
                </button>
              ))}
            </div>
            {value === OTHER && other}
          </div>
        );
      }
      return (
        <div>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} aria-label={aria} aria-invalid={invalid} className={cn(field, h, 'px-3', inv)}>
            <option value="">{t('form.choose')}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{optLabel(o, lang)}</option>)}
            {q.other && <option value={OTHER}>{t('form.other')}</option>}
          </select>
          {value === OTHER && other}
        </div>
      );
    }
    case 'selectMany': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const all = [...options, ...(q.other ? [{ value: OTHER, label: { en: t('form.other'), fr: t('form.other') } }] : [])];
      return (
        <div>
          <div className={cn('grid gap-1.5', !big && 'sm:grid-cols-2')} role="group" aria-label={aria}>
            {all.map((o) => {
              const on = list.includes(o.value);
              return (
                <button key={o.value} type="button" role="checkbox" aria-checked={on} onClick={() => onChange(on ? list.filter((x) => x !== o.value) : [...list, o.value])}
                  className={cn('flex items-center gap-3 rounded-ctl border px-3 text-left', big ? 'min-h-12 text-[16px]' : 'min-h-10 text-[14px]', on ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-surface text-body hover:border-brand/40', inv)}>
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-2 text-[10px] text-white', on ? 'border-brand bg-brand' : 'border-line')}>{on && '✓'}</span>
                  {optLabel(o, lang)}
                </button>
              );
            })}
          </div>
          {list.includes(OTHER) && <Input compact={!big} value={otherText ?? ''} onChange={(e) => onOtherText?.(e.target.value)} placeholder={t('form.otherPlaceholder')} aria-label={t('form.other')} className="mt-2" />}
        </div>
      );
    }
    case 'ranking': {
      const order = Array.isArray(value) && value.length ? (value as string[]) : options.map((o) => o.value);
      const move = (i: number, d: number) => { const a = [...order]; [a[i], a[i + d]] = [a[i + d]!, a[i]!]; onChange(a); };
      return (
        <ol className="space-y-1.5" aria-label={aria}>
          {order.map((v, i) => {
            const o = q.options?.find((x) => x.value === v);
            return (
              <li key={v} className={cn('flex items-center gap-2 rounded-ctl border border-line bg-surface px-3', big ? 'min-h-12' : 'min-h-10')}>
                <span className="tnum w-5 text-[13px] font-semibold text-brand">{i + 1}</span>
                <span className="flex-1 text-[14px] text-ink">{o ? optLabel(o, lang) : v}</span>
                <Button type="button" variant="ghost" size="iconSm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('form.moveUp')}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="iconSm" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t('form.moveDown')}><ArrowDown /></Button>
              </li>
            );
          })}
          {!Array.isArray(value) && <li className="text-[12px] text-muted">{t('form.rankHint')}</li>}
        </ol>
      );
    }
    case 'rating': {
      const max = Math.min(10, q.scale?.max ?? 5);
      if ((q.scale?.style ?? 'stars') === 'stars') {
        return (
          <div className="flex gap-1" role="radiogroup" aria-label={aria}>
            {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={String(v)} onClick={() => onChange(value === v ? undefined : v)} className={cn('flex items-center justify-center rounded-full', big ? 'h-12 w-12' : 'h-9 w-9')}>
                <Star className={cn(big ? 'h-8 w-8' : 'h-6 w-6', Number(value ?? 0) >= v ? 'fill-[#eda100] text-[#eda100]' : 'text-line')} />
              </button>
            ))}
          </div>
        );
      }
      return scaleButtons(Array.from({ length: max }, (_, i) => i + 1), q.scale?.style === 'checks' ? (v) => (Number(value ?? 0) >= v ? '✓' : String(v)) : undefined);
    }
    case 'likert': {
      const max = Math.min(10, Math.max(3, q.scale?.max ?? 5));
      const labels = q.scale?.labels;
      return (
        <div>
          {labels?.length === max ? (
            <div className={cn('grid gap-1.5', big ? 'grid-cols-1' : 'sm:grid-cols-5')} role="radiogroup" aria-label={aria}>
              {labels.map((l, i) => (
                <button key={i} type="button" role="radio" aria-checked={value === i + 1} onClick={() => onChange(value === i + 1 ? undefined : i + 1)} className={cn('rounded-ctl border px-2 py-2 text-[13px]', big && 'min-h-12 text-[15px]', value === i + 1 ? 'border-brand bg-brand text-on-brand' : 'border-line text-body hover:border-brand/50')}>
                  {l[lang] ?? l.en}
                </button>
              ))}
            </div>
          ) : scaleButtons(Array.from({ length: max }, (_, i) => i + 1))}
          {(q.scale?.low || q.scale?.high) && !labels?.length && <div className="mt-1 flex justify-between text-[12px] text-muted"><span>{q.scale.low?.[lang] ?? q.scale.low?.en}</span><span>{q.scale.high?.[lang] ?? q.scale.high?.en}</span></div>}
        </div>
      );
    }
    case 'nps':
      return (
        <div>
          {scaleButtons(Array.from({ length: 11 }, (_, i) => i))}
          <div className="mt-1 flex justify-between text-[12px] text-muted"><span>{q.scale?.low?.[lang] ?? t('form.npsLow')}</span><span>{q.scale?.high?.[lang] ?? t('form.npsHigh')}</span></div>
        </div>
      );
    case 'image':
    case 'video':
    case 'file':
      return <PhotoPicker value={Array.isArray(value) ? (value as string[]) : []} onChange={(v) => onChange(v.length ? v : undefined)} max={q.media?.max ?? (q.type === 'image' ? 3 : 1)} big={big} />;
    case 'audio': return <AudioCapture value={value as { seconds: number } | undefined} onChange={onChange} big={big} />;
    case 'signature': return <SignaturePad value={value as string | undefined} onChange={onChange} big={big} />;
    case 'gpsPoint': return <GpsCapture value={value as Gps | undefined} onChange={onChange} base={base} big={big} />;
    case 'gpsPolygon': return <PolygonCapture value={value as Polygon | undefined} onChange={onChange} base={base} big={big} />;
    case 'scanCode':
      return (
        <div className="space-y-2">
          <SimCapture kind="scanCode" value={value as string | undefined} onChange={onChange} big={big} />
          <Input compact={!big} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} placeholder={t('form.typeCode')} aria-label={aria} className="max-w-xs font-mono" />
        </div>
      );
    case 'nfcTap': return <SimCapture kind="nfcTap" value={value as string | undefined} onChange={onChange} big={big} />;
    case 'thumbprint': return <SimCapture kind="thumbprint" value={value as string | undefined} onChange={onChange} big={big} />;
    case 'autoId': return <p className="rounded-ctl bg-canvas px-3 py-2 font-mono text-[13px] text-muted">{value ? String(value) : t('form.autoIdHint')}</p>;
    case 'calculated': return <p className="tnum rounded-ctl bg-canvas px-3 py-2 text-[15px] font-semibold text-ink" aria-live="polite">{value == null ? '—' : String(value)}</p>;
    case 'note': return null;
    case 'contact': {
      const c = (value ?? {}) as { name?: string; phone?: string };
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input compact={!big} value={c.name ?? ''} onChange={(e) => onChange({ ...c, name: e.target.value })} placeholder={t('people.name')} aria-label={`${aria} · ${t('people.name')}`} />
          <Input compact={!big} type="tel" value={c.phone ?? ''} onChange={(e) => onChange({ ...c, phone: e.target.value })} placeholder={t('people.phone')} aria-label={`${aria} · ${t('people.phone')}`} />
        </div>
      );
    }
    case 'recordPicker': return <RecordPicker q={q} value={value as string | undefined} onChange={onChange} big={big} />;
    case 'locationPicker': return <LocationPicker value={value as string | undefined} onChange={onChange} big={big} />;
    case 'repeatGroup': {
      const rows = Array.isArray(value) ? (value as Answers[]) : [];
      return (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="rounded-ctl border border-line p-3">
              <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-label">
                {t('form.rowN', { n: i + 1 })}
                <Button type="button" variant="ghost" size="iconSm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={t('set.remove')}><Trash2 /></Button>
              </div>
              <div className={cn('grid gap-3', !big && 'sm:grid-cols-3')}>
                {q.children?.map((c) => (
                  <label key={c.id} className="block min-w-0">
                    <span className="mb-1 block text-[12px] text-muted">{qLabel(c, lang)}</span>
                    <QuestionInput q={c} value={row[c.id]} big={big} onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.id]: v } : r)))} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" size={big ? 'lg' : 'sm'} onClick={() => onChange([...rows, {}])}><Plus /> {t('form.addRow', { what: aria.toLocaleLowerCase(lang) })}</Button>
        </div>
      );
    }
    case 'table': {
      const v = (value ?? {}) as Record<string, Record<string, unknown>>;
      return (
        <div className="overflow-x-auto rounded-ctl border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-canvas text-left text-label"><tr><th className="px-3 py-2" />{q.columns?.map((c) => <th key={c.value} className="px-3 py-2 font-semibold">{optLabel(c, lang)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {q.rows?.map((r) => (
                <tr key={r.value}>
                  <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-ink">{optLabel(r, lang)}</th>
                  {q.columns?.map((c) => (
                    <td key={c.value} className="px-2 py-1.5">
                      <Input compact type="number" value={v[r.value]?.[c.value] == null ? '' : String(v[r.value]![c.value])} onChange={(e) => onChange({ ...v, [r.value]: { ...(v[r.value] ?? {}), [c.value]: e.target.value === '' ? undefined : Number(e.target.value) } })} className="h-9 min-w-20 tnum" aria-label={`${optLabel(r, lang)} · ${optLabel(c, lang)}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      void answers;
      return text('text');
  }
}

function RecordPicker({ q, value, onChange, big }: { q: Question; value?: string; onChange: (v: unknown) => void; big?: boolean }) {
  const { t } = useT();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const bags = useOrgRows(useBuyingStore((s) => s.bags));
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    switch (q.recordType ?? 'farmer') {
      case 'farmer': return farmers.map((f) => ({ id: f.id, label: `${f.firstName} ${f.lastName}`, detail: f.farmerCode }));
      case 'community': return communities.map((c) => ({ id: c.id, label: c.name, detail: c.code }));
      case 'group': return groups.map((g) => ({ id: g.id, label: g.name, detail: '' }));
      case 'bag': return bags.map((b) => ({ id: b.id, label: b.code, detail: '' }));
      default: return [];
    }
  }, [q.recordType, farmers, communities, groups, bags]);
  const current = items.find((x) => x.id === value);
  const ql = query.trim().toLowerCase();
  const shown = ql ? items.filter((x) => `${x.label} ${x.detail}`.toLowerCase().includes(ql)).slice(0, 8) : [];
  if (current) {
    return (
      <div className={cn('flex items-center gap-3 rounded-ctl border border-brand/40 bg-brand-soft px-3', big ? 'min-h-12' : 'min-h-10')}>
        <span className="flex-1 text-[14px] text-ink">{current.label} <span className="font-mono text-[12px] text-muted">{current.detail}</span></span>
        <Button type="button" variant="link" size="xs" onClick={() => onChange(undefined)}>{t('form.change')}</Button>
      </div>
    );
  }
  return (
    <div>
      <Input compact={!big} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('form.searchRecord', { type: t(`form.recordType.${q.recordType ?? 'farmer'}`) })} aria-label={qLabel(q, 'en')} />
      {shown.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-ctl border border-line bg-surface">
          {shown.map((x) => <li key={x.id}><button type="button" onClick={() => { onChange(x.id); setQuery(''); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-canvas"><span className="flex-1 text-ink">{x.label}</span><span className="font-mono text-[12px] text-muted">{x.detail}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}

function LocationPicker({ value, onChange, big }: { value?: string; onChange: (v: unknown) => void; big?: boolean }) {
  const { t } = useT();
  const lang = useLang();
  const levels = useOrgSettings().locationLevels;
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const path = useMemo(() => {
    const out: string[] = [];
    let cur = nodes.find((n) => n.id === value);
    while (cur) { out.unshift(cur.id); cur = nodes.find((n) => n.id === cur!.parentId); }
    return out;
  }, [nodes, value]);
  return (
    <div className={cn('grid gap-2', !big && 'sm:grid-cols-3')}>
      {levels.map((l, i) => {
        if (i > path.length) return null;
        const parent = i === 0 ? null : path[i - 1];
        const opts = nodes.filter((n) => n.levelId === l.id && (i === 0 || n.parentId === parent)).sort((a, b) => a.name.localeCompare(b.name));
        return (
          <select key={l.id} value={path[i] ?? ''} onChange={(e) => onChange(e.target.value || parent || undefined)} aria-label={l.label[lang] ?? l.label.en} className={cn(field, big ? 'h-12 text-[16px]' : 'h-ctl text-[14px]', 'px-3')}>
            <option value="">{l.label[lang] ?? l.label.en ?? t('form.choose')}</option>
            {opts.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        );
      })}
    </div>
  );
}
