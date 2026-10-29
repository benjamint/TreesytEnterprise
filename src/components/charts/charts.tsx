import { useId, useState, type ReactNode } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/**
 * Chart kit (dataviz method): categorical hues in fixed order from --series-1…8, thin marks,
 * 4px rounded data ends, recessive dashed grid, card tooltips on hover, and a table view for every chart.
 */
/** Slot colour by fixed position; -1 is the neutral "Other" bucket. */
export const seriesColor = (i: number) => (i < 0 ? 'rgb(var(--muted) / 0.45)' : `var(--series-${(i % 8) + 1})`);

const axisTick = { fill: 'rgb(var(--muted))', fontSize: 11 };
const grid = { vertical: false, stroke: 'rgb(var(--line))', strokeDasharray: '3 4' } as const;
const cursorFill = { fill: 'rgb(var(--ink) / 0.04)' };

export interface Datum {
  label: string;
  value: number;
}

interface TipEntry { name?: string | number; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

/** Hover card: the x label, then one row per series with its swatch (text stays in ink, never the series colour). */
function ChartTooltip({ active, payload, label, format, nameOf, pickValue }: { active?: boolean; payload?: TipEntry[]; label?: string | number; format: (v: number) => string; nameOf?: (key: string) => string; pickValue?: (e: TipEntry) => number }) {
  const rows = (payload ?? []).filter((e) => e.dataKey !== 'base' && e.value != null);
  if (!active || !rows.length) return null;
  return (
    <div className="min-w-[140px] rounded-ctl border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      {label != null && label !== '' && <div className="mb-1 font-medium text-muted">{label}</div>}
      <ul className="space-y-0.5">
        {[...rows].reverse().map((e) => (
          <li key={String(e.dataKey)} className="flex items-center gap-2">
            {rows.length > 1 && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: e.color }} aria-hidden="true" />}
            {rows.length > 1 && <span className="min-w-0 flex-1 truncate text-body">{nameOf?.(String(e.dataKey)) ?? e.name}</span>}
            <span className="tnum ml-auto font-semibold text-ink">{format(pickValue ? pickValue(e) : Number(e.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A chart with a "table" toggle so values never depend on colour or hover alone. */
export function ChartFrame({ table, children, legend, className }: { table: { head: string[]; rows: ReactNode[][] }; children: ReactNode; legend?: ReactNode; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  const { t } = useT();
  return (
    <div className={cn('relative', className)}>
      <div className="flex min-h-[20px] items-start justify-between gap-3">
        <div className="min-w-0">{!asTable && legend}</div>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="-mt-1 shrink-0 rounded-chip p-1.5 text-muted/80 transition-colors hover:bg-canvas hover:text-ink" aria-label={asTable ? t('chart.showChart') : t('chart.showTable')} aria-pressed={asTable}>
          {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-ctl border border-line" tabIndex={0} role="region" aria-label={t('chart.showTable')}>
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-subtle">
              <tr>{table.head.map((h, i) => <th key={i} className={cn('px-3 py-2 text-[12px] font-medium text-muted', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={cn('px-3 py-1.5', j ? 'tnum text-right text-ink' : 'text-body')}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-body">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ranked horizontal bars, one series: label and value on one line, a thin track below.
 * Values are always printed, so there is no hover layer to depend on.
 */
export function HBars({ data, format }: { data: Datum[]; format: (v: number) => string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ChartFrame table={{ head: ['', ''], rows: data.map((d) => [d.label, format(d.value)]) }}>
      <ul className="space-y-3.5" role="list">
        {data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="group">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-body">{d.label}</span>
              <span className="tnum shrink-0 font-medium text-ink">{format(d.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
              <div className={cn('h-full rounded-full transition-[width] duration-500', i === 0 ? 'bg-brand' : 'bg-brand/60 group-hover:bg-brand/80')} style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}

/** Stacked columns over time; series keep their colour by position in `series`. */
export function StackedColumns({ data, series, format, axisFormat, xKey = 'label' }: { data: Record<string, number | string>[]; series: { key: string; label: string; index: number }[]; format: (v: number) => string; axisFormat?: (v: number) => string; xKey?: string }) {
  const last = series[series.length - 1]?.key;
  const nameOf = (k: string) => series.find((s) => s.key === k)?.label ?? k;
  return (
    <ChartFrame
      legend={<Legend items={series.map((s) => ({ label: s.label, color: seriesColor(s.index) }))} />}
      table={{ head: ['', ...series.map((s) => s.label)], rows: data.map((d) => [String(d[xKey]), ...series.map((s) => format(Number(d[s.key] ?? 0)))]) }}
    >
      {/* Fixed height: a chart sized from its container makes stretched grid cells grow without end. */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: -8, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid {...grid} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} tickFormatter={(v: number) => (axisFormat ?? format)(v)} />
            <Tooltip cursor={cursorFill} content={<ChartTooltip format={format} nameOf={nameOf} />} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={seriesColor(s.index)} stroke="rgb(var(--surface))" strokeWidth={1.5} radius={s.key === last ? [4, 4, 0, 0] : 0} maxBarSize={30} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Part-to-whole for a few categories, always with a labelled legend. */
export function Donut({ data, format, center }: { data: (Datum & { index: number })[]; format: (v: number) => string; center?: ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ChartFrame table={{ head: ['', '', '%'], rows: data.map((d) => [d.label, format(d.value), `${Math.round((d.value / total) * 100)}%`]) }}>
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="74%" outerRadius="100%" paddingAngle={1.5} cornerRadius={3} stroke="rgb(var(--surface))" strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.label} fill={seriesColor(d.index)} aria-label={`${d.label}: ${format(d.value)}`} />)}
              </Pie>
              <Tooltip content={<ChartTooltip format={format} />} />
            </PieChart>
          </ResponsiveContainer>
          {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
        </div>
        <ul className="w-full divide-y divide-line text-[13px]">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(d.index) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-body">{d.label}</span>
              <span className="tnum text-ink">{format(d.value)}</span>
              <span className="tnum w-10 text-right text-muted">{Math.round((d.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

/** Progress toward a whole: big number plus a meter (clearer than a dial). */
export function Meter({ value, max, label, detail }: { value: number; max: number; label: string; detail?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink">{pct}%</span>
        <span className="text-[13px] text-muted">{label}</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-canvas" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {detail && <div className="mt-4 text-[13px] leading-relaxed text-body">{detail}</div>}
    </div>
  );
}

/** Small trend line for a stat: area fades to nothing, last point marked. Decorative next to the printed value. */
export function Sparkline({ values, className, color = 'rgb(var(--brand))' }: { values: number[]; className?: string; color?: string }) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const w = 120;
  const h = 36;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 8)] as const);
  // Catmull-Rom through the points, drawn as cubic Béziers, for a smooth line that still hits every week.
  const f1 = (n: number) => n.toFixed(1);
  let line = `M${f1(pts[0]![0])},${f1(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C${f1(c1[0]!)},${f1(c1[1]!)} ${f1(c2[0]!)},${f1(c2[1]!)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-9 w-full overflow-visible', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`sp${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#sp${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} stroke="rgb(var(--surface))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Waterfall: running total from a start value through signed steps to the end value (one axis, brand ends). */
export function Waterfall({ steps, format, axisFormat }: { steps: { label: string; value: number; total?: boolean }[]; format: (v: number) => string; axisFormat?: (v: number) => string }) {
  let run = 0;
  const data = steps.map((s) => {
    if (s.total) { run = s.value; return { label: s.label, base: 0, value: Math.abs(s.value), raw: s.value, total: true }; }
    const from = run;
    run += s.value;
    return { label: s.label, base: Math.min(from, run), value: Math.abs(s.value), raw: s.value, total: false };
  });
  return (
    <ChartFrame table={{ head: ['', ''], rows: steps.map((s) => [s.label, format(s.value)]) }}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: -4, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid {...grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval={0} dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} width={64} tickFormatter={(v: number) => (axisFormat ?? format)(v)} />
            <Tooltip cursor={cursorFill} content={<ChartTooltip format={format} pickValue={(e) => Number(e.payload?.raw ?? 0)} />} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="value"
              stackId="w"
              radius={[4, 4, 4, 4]}
              maxBarSize={40}
              isAnimationActive={false}
              label={(props: { x?: number; y?: number; width?: number; index?: number }) => (
                <text x={(props.x ?? 0) + (props.width ?? 0) / 2} y={(props.y ?? 0) - 7} textAnchor="middle" fontSize={11} fontWeight={500} fill="rgb(var(--body))">{format(data[props.index ?? 0]?.raw || 0)}</text>
              )}
            >
              {data.map((d, i) => <Cell key={i} fill={d.total ? 'rgb(var(--brand))' : d.raw < 0 ? seriesColor(1) : seriesColor(3)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** One or more lines over time on one axis (2px lines, soft area under a single series, legend for ≥ 2 series). */
export function Lines({ data, series, format, axisFormat, xKey = 'label' }: { data: Record<string, number | string>[]; series: { key: string; label: string; index: number; dashed?: boolean }[]; format: (v: number) => string; axisFormat?: (v: number) => string; xKey?: string }) {
  const gid = useId().replace(/:/g, '');
  const nameOf = (k: string) => series.find((s) => s.key === k)?.label ?? k;
  const solid = series.filter((s) => !s.dashed);
  const fillOne = solid.length === 1;
  return (
    <ChartFrame
      legend={series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: seriesColor(s.index) }))} /> : undefined}
      table={{ head: ['', ...series.map((s) => s.label)], rows: data.map((d) => [String(d[xKey]), ...series.map((s) => (d[s.key] == null ? '—' : format(Number(d[s.key]))))]) }}
    >
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
            <defs>
              {solid.map((s) => (
                <linearGradient key={s.key} id={`ln${gid}${s.index}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={seriesColor(s.index)} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={seriesColor(s.index)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} width={64} tickFormatter={(v: number) => (axisFormat ?? format)(v)} domain={['auto', 'auto']} />
            <Tooltip cursor={{ stroke: 'rgb(var(--line-strong))', strokeWidth: 1 }} content={<ChartTooltip format={format} nameOf={nameOf} />} />
            {series.map((s) =>
              s.dashed ? (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={seriesColor(s.index)} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} connectNulls isAnimationActive={false} />
              ) : (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={seriesColor(s.index)} strokeWidth={2} fill={fillOne ? `url(#ln${gid}${s.index})` : 'transparent'} dot={data.length <= 8 ? { r: 3, strokeWidth: 2, stroke: 'rgb(var(--surface))', fill: seriesColor(s.index) } : false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} connectNulls isAnimationActive={false} />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
