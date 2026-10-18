import type { NumberingPattern } from '@/types';

/**
 * Numbering engine (PRD 8.2). Tokens:
 * {prefix} {yy} {yyyy} {mm} {yymm} {seq:n} {initials} {orgCode} {region} {district}
 * {community} {commodityCode} {clientCode}
 */
export interface NumberContext {
  date?: Date;
  orgCode?: string;
  initials?: string;
  region?: string;
  district?: string;
  community?: string;
  commodityCode?: string;
  clientCode?: string;
  agentId?: string;
}

export const TOKENS = ['prefix', 'yy', 'yyyy', 'mm', 'yymm', 'seq', 'initials', 'orgCode', 'region', 'district', 'community', 'commodityCode', 'clientCode'] as const;

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Initials from a name: "Abena Issah" → "AI". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .join('')
    .slice(0, 3);
}

export function formatNumber(p: Pick<NumberingPattern, 'pattern' | 'prefix'>, seq: number, ctx: NumberContext = {}): string {
  const d = ctx.date ?? new Date();
  const yyyy = String(d.getFullYear());
  const mm = pad(d.getMonth() + 1, 2);
  const values: Record<string, string> = {
    prefix: p.prefix,
    yyyy,
    yy: yyyy.slice(2),
    mm,
    yymm: yyyy.slice(2) + mm,
    initials: ctx.initials ?? '',
    orgCode: ctx.orgCode ?? '',
    region: ctx.region ?? '',
    district: ctx.district ?? '',
    community: ctx.community ?? '',
    commodityCode: ctx.commodityCode ?? '',
    clientCode: ctx.clientCode ?? '',
  };
  return p.pattern.replace(/\{(\w+)(?::(\d+))?\}/g, (whole, token: string, width?: string) => {
    if (token === 'seq') return pad(seq, width ? Number(width) : 4);
    return token in values ? values[token] : whole;
  });
}

/** The key a sequence counter is stored under, from the pattern's scope. */
export function scopeKey(p: NumberingPattern, ctx: NumberContext = {}): string {
  const d = ctx.date ?? new Date();
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1, 2);
  switch (p.scope) {
    case 'year':
      return `${p.docType}:${yyyy}`;
    case 'month':
      return `${p.docType}:${yyyy}-${mm}`;
    case 'client':
      return `${p.docType}:client:${ctx.clientCode ?? '-'}`;
    case 'agent':
      return `${p.docType}:agent:${ctx.agentId ?? '-'}`;
    case 'community':
      return `${p.docType}:community:${ctx.community ?? '-'}`;
    default:
      return p.docType;
  }
}

/** Issue the next number. Returns the number and the updated sequences (pure). */
export function nextNumber(
  p: NumberingPattern,
  sequences: Record<string, number>,
  ctx: NumberContext = {},
): { number: string; seq: number; key: string; sequences: Record<string, number> } {
  const key = scopeKey(p, ctx);
  const seq = (sequences[key] ?? 0) + 1;
  return { number: formatNumber(p, seq, ctx), seq, key, sequences: { ...sequences, [key]: seq } };
}

/** Live preview shown in Settings → Numbering. */
export function previewNumber(p: NumberingPattern, sequences: Record<string, number>, ctx: NumberContext = {}): string {
  return nextNumber(p, sequences, ctx).number;
}

export function unknownTokens(pattern: string): string[] {
  const found = [...pattern.matchAll(/\{(\w+)(?::\d+)?\}/g)].map((m) => m[1]);
  return found.filter((t) => !(TOKENS as readonly string[]).includes(t));
}
