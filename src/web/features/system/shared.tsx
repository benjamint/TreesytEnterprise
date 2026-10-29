import { Fragment, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SavedReport } from '@/types';
import { Badge } from '@/components/ui/badge';
import type { ReportColumn, Row } from '@/services/reportService';
import { useAccessStore } from '@/stores/accessStore';
import { fromMinor } from '@/engines/money';
import { useCurrentOrg, useFormat, useT } from '@/stores/hooks';

/** "PENDING_REVIEW" → "Pending review" (when no translation exists). */
export const humanize = (v: string) => v.replace(/[_-]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Report headings, enum values and cells in the viewer's language and the company's money format. */
export function useReportText() {
  const { t } = useT();
  const f = useFormat();
  const currency = useCurrentOrg().currency;
  return useMemo(() => {
    const heading = (c: Pick<ReportColumn, 'key' | 'label'>) => c.label ?? t(`rpt.col.${c.key}`, { defaultValue: humanize(c.key) });
    const value = (v: string) => t(`rpt.val.${v}`, { defaultValue: humanize(v) });
    const cell = (c: ReportColumn, v: Row[string]): string => {
      if (v == null || v === '') return '—';
      if (c.kind === 'money') return f.money(Number(v));
      if (c.kind === 'number') return f.number(Number(v));
      if (c.kind === 'date') return String(v).length === 7 ? f.date(`${v}-01`, 'MMM yyyy') : f.date(String(v));
      if (c.kind === 'bool') return v ? t('common.yes') : t('common.no');
      if (c.kind === 'enum') return value(String(v));
      return String(v);
    };
    /** Plain value for exports: numbers stay numbers so spreadsheets can sum them. */
    const raw = (c: ReportColumn, v: Row[string]): string | number => {
      if (v == null) return '';
      if (c.kind === 'money') return fromMinor(Number(v), currency);
      if (c.kind === 'number') return Number(v);
      if (c.kind === 'enum') return value(String(v));
      if (c.kind === 'bool') return v ? t('common.yes') : t('common.no');
      return String(v);
    };
    const reportName = (r: Pick<SavedReport, 'libraryKey' | 'name'>) => (r.libraryKey ? t(`rpt.lib.${r.libraryKey}.name`) : r.name);
    const reportDesc = (r: Pick<SavedReport, 'libraryKey' | 'description'>) => (r.libraryKey ? t(`rpt.lib.${r.libraryKey}.desc`) : r.description ?? '');
    const entityName = (key: string) => t(`rpt.entity.${key}`);
    return { heading, value, cell, raw, reportName, reportDesc, entityName, currency };
  }, [t, f, currency]);
}

export function useUserName() {
  const users = useAccessStore((s) => s.users);
  return useMemo(() => { const m = new Map(users.map((u) => [u.id, u.name])); return (id?: string) => (!id ? '—' : id === 'system' ? 'TreeSyt' : m.get(id) ?? id); }, [users]);
}

/** Pretty JSON with keys and strings coloured, inside a scrollable code block. */
export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  const parts = text.split(/("(?:\\.|[^"\\])*"\s*:?)/g);
  return (
    <pre aria-label={label} className="max-h-80 overflow-auto rounded-ctl border border-line bg-canvas p-3 font-mono text-[12px] leading-relaxed text-body" tabIndex={0}>
      {parts.map((p, i) => (p.startsWith('"') ? <span key={i} className={p.trimEnd().endsWith(':') ? 'text-brand' : 'text-ink'}>{p}</span> : <Fragment key={i}>{p}</Fragment>))}
    </pre>
  );
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { SUCCESS: 'success', PARTIAL: 'warning', FAILED: 'danger', SENT: 'info', DELIVERED: 'success', READY: 'success', RUNNING: 'info', EXPIRED: 'neutral', ACTIVE: 'success', SIGNED_OUT: 'neutral', EXPIRED_TOKEN: 'warning', NONE: 'neutral' };
export function SysStatus({ status }: { status: string }) {
  const { t } = useT();
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{t(`sys.status.${status}`, { defaultValue: humanize(status) })}</Badge>;
}

// ---------------------------------------------------------------- Markdown (help articles)

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={`${key}-${i++}`} className="rounded bg-canvas px-1 py-0.5 font-mono text-[13px] text-ink">{tok.slice(1, -1)}</code>);
    else {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(href!.startsWith('/') ? <Link key={`${key}-${i++}`} to={href!} className="font-medium text-brand underline-offset-2 hover:underline">{label}</Link> : <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className="font-medium text-brand underline-offset-2 hover:underline">{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A small, safe markdown renderer: headings, paragraphs, lists, checklists, quotes, bold, code and links. */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const cls = level === 1 ? 'text-[22px] font-semibold text-ink' : level === 2 ? 'mt-2 text-[15px] font-semibold text-ink' : 'text-[14px] font-semibold text-ink';
      blocks.push(level === 1 ? <h2 key={k++} className={cls}>{inline(h[2]!, `h${k}`)}</h2> : <h3 key={k++} className={cls}>{inline(h[2]!, `h${k}`)}</h3>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k++} className={ordered ? 'list-decimal space-y-1 pl-5' : 'space-y-1 pl-5 [&>li]:list-disc'}>
          {items.map((it, j) => {
            const check = /^\[( |x)\]\s+(.*)$/i.exec(it);
            return check
              ? <li key={j} className="!list-none -ml-5 flex items-start gap-2"><input type="checkbox" disabled defaultChecked={check[1]!.toLowerCase() === 'x'} className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" aria-label={check[2]} /><span>{inline(check[2]!, `l${k}-${j}`)}</span></li>
              : <li key={j}>{inline(it, `l${k}-${j}`)}</li>;
          })}
        </List>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) { quote.push(lines[i]!.replace(/^>\s?/, '')); i++; }
      blocks.push(<blockquote key={k++} className="rounded-ctl border-l-4 border-brand/40 bg-brand-soft/40 px-4 py-2 text-ink">{inline(quote.join(' '), `q${k}`)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|>|\s*([-*]|\d+\.)\s)/.test(lines[i]!)) { para.push(lines[i]!); i++; }
    blocks.push(<p key={k++}>{inline(para.join(' '), `p${k}`)}</p>);
  }
  return <div className="space-y-3 text-[14px] leading-relaxed text-body">{blocks}</div>;
}
