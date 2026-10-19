import { useMemo, useRef, useState } from 'react';
import type { NumberingPattern, SequenceScope } from '@/types';
import { Badge } from '@/components/ui/badge';
import { TOKENS, formatNumber, previewNumber, scopeKey, unknownTokens, type NumberContext } from '@/engines/numbering';
import { cn } from '@/lib/utils';
import { useLocationStore } from '@/stores/locationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActor, useCurrentOrg, useFormat, useOrgSettings, useT } from '@/stores/hooks';
import { bind, useSettingsDraft } from '../draft';
import { Section, Select, SettingsFrame, TextInput } from '../kit';

const SCOPES: SequenceScope[] = ['company', 'year', 'month', 'client', 'agent', 'community'];
export const CODE_DOC_TYPES = ['farmerId', 'communityCode', 'seedlingCode', 'nurseryBatch'];
const KEYS = ['numbering'] as const;

/** A realistic context so previews look like real numbers for this company. */
function useSampleContext(): NumberContext {
  const org = useCurrentOrg();
  const { orgId } = useActor();
  const settings = useOrgSettings();
  const nodes = useLocationStore((s) => s.nodes);
  return useMemo(() => {
    const own = nodes.filter((n) => n.orgId === orgId);
    const levels = settings.locationLevels.map((l) => l.id);
    const at = (i: number) => own.find((n) => n.levelId === levels[i])?.code;
    return {
      date: new Date(), orgCode: org.code, initials: 'AI', region: at(0) ?? 'UW', district: at(1) ?? 'WA',
      community: at(levels.length - 1) ?? 'BUS', commodityCode: settings.commodities[0]?.code ?? 'SHN', clientCode: 'NSB', agentId: 'agent',
    };
  }, [nodes, orgId, settings.locationLevels, settings.commodities, org.code]);
}

function NumberingEditor({ page, docTypes, exclude }: { page: 'numbering' | 'farmerId'; docTypes?: string[]; exclude?: string[] }) {
  const d = useSettingsDraft(page, KEYS);
  const { numbering } = d.value;
  const { t } = useT();
  const f = useFormat();
  const { orgId } = useActor();
  const sequences = useSettingsStore((s) => s.sequences[orgId]);
  const ctx = useSampleContext();
  const rows = numbering.filter((p) => (docTypes ? docTypes.includes(p.docType) : !exclude?.includes(p.docType)));
  const [focused, setFocused] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const set = (docType: string, patch: Partial<NumberingPattern>) => d.set('numbering', numbering.map((p) => (p.docType === docType ? { ...p, ...patch } : p)));

  const insert = (token: string) => {
    if (!focused) return;
    const el = inputs.current[focused];
    const p = numbering.find((x) => x.docType === focused)!;
    const at = el?.selectionStart ?? p.pattern.length;
    const text = token === 'seq' ? '{seq:4}' : `{${token}}`;
    set(focused, { pattern: p.pattern.slice(0, at) + text + p.pattern.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };

  const errors: string[] = [];
  for (const p of rows) {
    const bad = unknownTokens(p.pattern);
    if (bad.length) errors.push(t('set.numbering.errToken', { doc: t(`docType.${p.docType}`), tokens: bad.map((x) => `{${x}}`).join(' ') }));
    if (!/\{seq(:\d+)?\}/.test(p.pattern)) errors.push(t('set.numbering.errSeq', { doc: t(`docType.${p.docType}`) }));
  }
  const patterns = numbering.map((p) => formatNumber(p, 1, ctx).replace(/\d+$/, ''));
  const clash = numbering.find((p, i) => patterns.indexOf(patterns[i]!) !== i && p.prefix);
  if (clash) errors.push(t('set.numbering.errClash', { doc: t(`docType.${clash.docType}`) }));

  return (
    <SettingsFrame page={page} {...bind(d)} errors={errors}>
      <div className="sticky top-16 z-10 -mx-1 rounded-card border border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.numbering.tokens')}</div>
        <div className="flex flex-wrap gap-1.5">
          {TOKENS.map((tok) => (
            <button key={tok} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(tok)} disabled={!focused} className="rounded-full border border-line px-2.5 py-1 font-mono text-[12px] text-ink hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50" title={t(`set.numbering.token.${tok}`)}>
              {tok === 'seq' ? '{seq:n}' : `{${tok}}`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">{focused ? t('set.numbering.insertInto', { doc: t(`docType.${focused}`) }) : t('set.numbering.focusHint')}</p>
      </div>

      <Section title={t(page === 'farmerId' ? 'set.numbering.codes' : 'set.numbering.docs')} description={t('set.numbering.hint')}>
        <div className="space-y-3">
          {rows.map((p) => {
            const bad = unknownTokens(p.pattern);
            const next = bad.length ? '—' : previewNumber(p, sequences ?? {}, ctx);
            const current = sequences?.[scopeKey(p, ctx)] ?? 0;
            return (
              <div key={p.docType} className={cn('grid items-end gap-3 rounded-card border p-4 lg:grid-cols-[minmax(0,200px)_110px_minmax(0,1fr)_160px_minmax(0,220px)]', focused === p.docType ? 'border-brand/50' : 'border-line')}>
                <div className="min-w-0 self-center">
                  <div className="font-medium text-ink">{t(`docType.${p.docType}`)}</div>
                  <div className="text-[12px] text-muted">{t('set.numbering.issued', { count: current, n: f.number(current) })}</div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.numbering.prefix')}</span>
                  <TextInput value={p.prefix} onChange={(prefix) => set(p.docType, { prefix: prefix.toUpperCase() })} className="font-mono" />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.numbering.pattern')}</span>
                  <TextInput
                    ref={(el: HTMLInputElement | null) => { inputs.current[p.docType] = el; }}
                    value={p.pattern}
                    onFocus={() => setFocused(p.docType)}
                    onChange={(pattern) => set(p.docType, { pattern })}
                    className={cn('font-mono', bad.length && 'border-danger')}
                    aria-invalid={bad.length > 0}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.numbering.scope')}</span>
                  <Select value={p.scope} onChange={(scope) => set(p.docType, { scope })} options={SCOPES.map((s) => ({ value: s, label: t(`set.numbering.scopeName.${s}`) }))} />
                </label>
                <div className="min-w-0 rounded-ctl bg-canvas px-3 py-2" aria-live="polite">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-label">{t('set.numbering.next')}</div>
                  <div className="truncate font-mono text-[15px] font-semibold text-ink">{next}</div>
                </div>
              </div>
            );
          })}
        </div>
        {page === 'farmerId' && <p className="mt-4 text-[13px] text-muted"><Badge tone="neutral">{t('set.numbering.existing')}</Badge> {t('set.numbering.existingHint')}</p>}
      </Section>
    </SettingsFrame>
  );
}

export function NumberingPage() {
  return <NumberingEditor page="numbering" exclude={CODE_DOC_TYPES} />;
}

export function FarmerIdPage() {
  return <NumberingEditor page="farmerId" docTypes={CODE_DOC_TYPES} />;
}
