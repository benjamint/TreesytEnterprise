import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/**
 * Chart kit (dataviz method): categorical hues in fixed order from --series-1…8, thin marks,
 * 4px rounded data ends, recessive grid, hover tooltips, and a table view for every chart.
 */
/** Slot colour by fixed position; -1 is the neutral "Other" bucket. */
export const seriesColor = (i: number) => (i < 0 ? 'rgb(var(--muted) / 0.55)' : `var(--series-${(i % 8) + 1})`);

const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--line))', background: 'rgb(var(--surface))', color: 'rgb(var(--ink))', fontSize: 13, boxShadow: '0 8px 24px rgb(0 0 0 / 0.08)' };
const axisTick = { fill: 'rgb(var(--muted))', fontSize: 12 };

export interface Datum {
  label: string;
  value: number;
}

/** A chart with a "table" toggle so values never depend on colour or hover alone. */
export function ChartFrame({ table, children, legend, className }: { table: { head: string[]; rows: ReactNode[][] }; children: ReactNode; legend?: ReactNode; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  const { t } = useT();
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{!asTable && legend}</div>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="-mt-1 shrink-0 rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label={asTable ? t('chart.showChart') : t('chart.showTable')} aria-pressed={asTable}>
          {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-ctl border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-canvas">
              <tr>{table.head.map((h, i) => <th key={i} className={cn('px-3 py-2 text-[12px] font-semibold text-label', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
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
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-body">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars, one series (brand colour), sorted by the caller. */
export function HBars({ data, format, height }: { data: Datum[]; format: (v: number) => string; height?: number }) {
  const h = height ?? Math.max(120, data.length * 34 + 16);
  return (
    <ChartFrame table={{ head: ['', ''], rows: data.map((d) => [d.label, format(d.value)]) }}>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 84, left: 0, bottom: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} tick={axisTick} />
            <Tooltip cursor={{ fill: 'rgb(var(--brand-soft))' }} contentStyle={tooltipStyle} formatter={(v: number) => [format(v), '']} separator="" />
            <Bar
              dataKey="value"
              fill="rgb(var(--brand))"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              label={(props: { x?: number; y?: number; width?: number; height?: number; value?: number }) => (
                <text x={(props.x ?? 0) + (props.width ?? 0) + 6} y={(props.y ?? 0) + (props.height ?? 0) / 2} dominantBaseline="central" fontSize={12} fill="rgb(var(--body))">{format(Number(props.value ?? 0))}</text>
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Stacked columns over time; series keep their colour by position in `series`. */
export function StackedColumns({ data, series, format, axisFormat, xKey = 'label' }: { data: Record<string, number | string>[]; series: { key: string; label: string; index: number }[]; format: (v: number) => string; axisFormat?: (v: number) => string; xKey?: string }) {
  const last = series[series.length - 1]?.key;
  return (
    <ChartFrame
      legend={<Legend items={series.map((s) => ({ label: s.label, color: seriesColor(s.index) }))} />}
      table={{ head: ['', ...series.map((s) => s.label)], rows: data.map((d) => [String(d[xKey]), ...series.map((s) => format(Number(d[s.key] ?? 0)))]) }}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} tickFormatter={(v: number) => (axisFormat ?? format)(v)} />
            <Tooltip cursor={{ fill: 'rgb(var(--brand-soft))' }} contentStyle={tooltipStyle} formatter={(v: number, name: string) => [format(v), series.find((s) => s.key === name)?.label ?? name]} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={seriesColor(s.index)} stroke="rgb(var(--surface))" strokeWidth={1} radius={s.key === last ? [4, 4, 0, 0] : 0} maxBarSize={28} />
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
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={1} stroke="rgb(var(--surface))" strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.label} fill={seriesColor(d.index)} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [format(v), n]} />
            </PieChart>
          </ResponsiveContainer>
          {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
        </div>
        <ul className="w-full space-y-1.5 text-[13px]">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(d.index) }} aria-hidden="true" />
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
        <span className="tnum text-[40px] font-semibold leading-none text-ink">{pct}%</span>
        <span className="text-[14px] text-muted">{label}</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-canvas" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {detail && <div className="mt-3 text-[13px] text-body">{detail}</div>}
    </div>
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
          <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} width={64} tickFormatter={(v: number) => (axisFormat ?? format)(v)} />
            <Tooltip cursor={{ fill: 'rgb(var(--brand-soft))' }} contentStyle={tooltipStyle} formatter={(_v: number, name: string, p: { payload?: { raw: number } }) => (name === 'base' ? [null, null] : [format(p.payload?.raw ?? 0), ''])} separator="" />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="value"
              stackId="w"
              radius={[4, 4, 4, 4]}
              maxBarSize={44}
              isAnimationActive={false}
              label={(props: { x?: number; y?: number; width?: number; index?: number }) => (
                <text x={(props.x ?? 0) + (props.width ?? 0) / 2} y={(props.y ?? 0) - 6} textAnchor="middle" fontSize={12} fill="rgb(var(--body))">{format(data[props.index ?? 0]?.raw || 0)}</text>
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

/** One or more lines over time on one axis (2px lines, legend for ≥ 2 series). */
export function Lines({ data, series, format, axisFormat, xKey = 'label' }: { data: Record<string, number | string>[]; series: { key: string; label: string; index: number; dashed?: boolean }[]; format: (v: number) => string; axisFormat?: (v: number) => string; xKey?: string }) {
  return (
    <ChartFrame
      legend={series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: seriesColor(s.index) }))} /> : undefined}
      table={{ head: ['', ...series.map((s) => s.label)], rows: data.map((d) => [String(d[xKey]), ...series.map((s) => (d[s.key] == null ? '—' : format(Number(d[s.key]))))]) }}
    >
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} width={64} tickFormatter={(v: number) => (axisFormat ?? format)(v)} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [format(v), series.find((s) => s.key === name)?.label ?? name]} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={seriesColor(s.index)} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))', fill: seriesColor(s.index) }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
