import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeed } from '@/data/seed';

/** Quality bar (PRD 15) checks that cover the whole codebase rather than one feature. */

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe('company isolation', () => {
  const seed = buildSeed(new Date('2026-10-18T10:00:00Z'));
  // Cross-company links that exist by design: data sharing with buyers, people in several companies.
  const ALLOWED = new Set(['buyerOrgId', 'userId', 'actorId', 'createdBy', 'updatedBy', 'by', 'invitedBy', 'grantedBy', 'uploadedBy', 'assigneeId', 'managerId', 'initiatedBy', 'approvedBy', 'deviceId', 'templateId', 'planId', 'roleId']);
  const owner = new Map<string, string>();
  const rows: { coll: string; row: Record<string, unknown> }[] = [];
  for (const [coll, v] of Object.entries(seed)) {
    if (!Array.isArray(v)) continue;
    for (const r of v as Record<string, unknown>[]) {
      if (r && typeof r === 'object' && typeof r.id === 'string' && typeof r.orgId === 'string') { owner.set(r.id, r.orgId); rows.push({ coll, row: r }); }
    }
  }
  it('no record points at another company’s record', () => {
    const bad: string[] = [];
    for (const { coll, row } of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (ALLOWED.has(k) || k === 'id' || k === 'orgId') continue;
        const ids = k.endsWith('Id') && typeof v === 'string' ? [v] : k.endsWith('Ids') && Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        for (const id of ids) { const o = owner.get(id); if (o && o !== row.orgId) bad.push(`${coll}.${k} ${String(row.id)} → ${id} (${o})`); }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it('every company-owned collection holds rows for more than one company, so filters are exercised', () => {
    const per = new Map<string, Set<string>>();
    for (const { coll, row } of rows) per.set(coll, (per.get(coll) ?? new Set()).add(String(row.orgId)));
    const single = ['farmers', 'purchases', 'payments', 'agents', 'communities', 'syncLogs', 'savedReports'].filter((c) => (per.get(c)?.size ?? 0) < 2);
    expect(single).toEqual([]);
  });
});

describe('no hard-coded text in components', () => {
  const files = ['src/web', 'src/mobile', 'src/components', 'src/public'].flatMap(walk).filter((f) => f.endsWith('.tsx'));
  // Product names, units and sample data shown literally on purpose.
  // Sample values in placeholders (a PO number, a domain, a formula) are examples, not prose.
  const SAMPLES = new Set(['PO-04291', 'example.com', 'members - childrenCount']);
  const OK = /^(TreeSyt|Vitara|Kakao Ivoire|OK|PDF|CSV|XLSX|JSON|API|SMS|GPS|EUDR|ID|v\d|GHS|XOF|kg|ha|—|–|·|\d.*)$/;
  it('JSX text and labels go through t()', () => {
    const found: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/>\s*([A-Z][a-z]+(?:[ ,'’][A-Za-z]+){1,})\s*</g)) if (!OK.test(m[1]!)) found.push(`${f}: ${m[1]}`);
      for (const m of src.matchAll(/\b(?:placeholder|aria-label|title|alt)="([A-Za-z][^"{]{3,})"/g)) if (!OK.test(m[1]!) && !SAMPLES.has(m[1]!.trim())) found.push(`${f}: ${m[1]}`);
    }
    expect(found).toEqual([]);
  });
});

describe('translation keys used in code exist', () => {
  const en = JSON.parse(readFileSync('src/i18n/en.json', 'utf8')) as Record<string, unknown>;
  const has = (k: string) => { let cur: unknown = en; for (const p of k.split('.')) { if (!cur || typeof cur !== 'object') return false; const o = cur as Record<string, unknown>; cur = p in o ? o[p] : o[`${p}_other`] ?? o[`${p}_one`]; } return typeof cur === 'string'; };
  it('every literal t("…") key resolves to text', () => {
    const missing = new Set<string>();
    for (const f of ['src'].flatMap(walk).filter((x) => /\.(ts|tsx)$/.test(x) && !x.includes('.test.'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'/g)) if (!has(m[1]!)) missing.add(m[1]!);
    }
    expect([...missing]).toEqual([]);
  });
});
