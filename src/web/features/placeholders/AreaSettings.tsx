import { Fragment, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowRight, Settings2 } from 'lucide-react';
import type { DocType, OrgSettings } from '@/types';
import { previewNumber } from '@/engines/numbering';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActor, useCan, useFormat, useLang, useOrgSettings, useT } from '@/stores/hooks';

interface Item {
  label: string;
  value: ReactNode;
  page: string;
}

const WORKFLOW_OF: Record<string, DocType> = { purchaseRequests: 'purchaseRequest', expenses: 'preExpense', aggregators: 'aggregatorPurchase' };
const NUMBER_OF: Record<string, string> = { purchaseRequests: 'purchaseRequest', expenses: 'preExpense', aggregators: 'aggregatorPurchase', purchases: 'purchase', farmers: 'farmerId', communities: 'communityCode', dispatch: 'dispatchOrder', payments: 'payment' };
const TOLERANCE_OF: Record<string, 'INBOUND' | 'TRANSFER'> = { warehouses: 'INBOUND', inbound: 'INBOUND', outbound: 'TRANSFER' };

/**
 * "How {company} runs this": the settings in effect for the page (approval route, next number,
 * loss tolerances), each linking to the settings page that changes it.
 */
export function AreaSettings({ routeKey }: { routeKey: string }) {
  const s = useOrgSettings();
  const { orgId } = useActor();
  const sequences = useSettingsStore((st) => st.sequences[orgId]);
  const lang = useLang();
  const { t } = useT();
  const f = useFormat();
  const can = useCan();
  const items: Item[] = [];

  const wf = WORKFLOW_OF[routeKey] && s.workflows.find((w) => w.docType === WORKFLOW_OF[routeKey]);
  if (wf) {
    items.push({
      label: t('area.approvalRoute'),
      page: 'approvals',
      value: (
        <span className="flex flex-wrap items-center gap-1">
          {wf.steps.map((st, i) => (
            <Fragment key={st.id}>
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted" aria-hidden="true" />}
              <span className={st.auto ? 'text-muted' : undefined}>{st.name}{st.condition?.field === 'total' ? ` (> ${f.money(Number(st.condition.value))})` : ''}</span>
            </Fragment>
          ))}
        </span>
      ),
    });
  }
  const pattern = NUMBER_OF[routeKey] && s.numbering.find((p) => p.docType === NUMBER_OF[routeKey]);
  if (pattern) items.push({ label: t('area.nextNumber'), page: ['farmerId', 'communityCode'].includes(pattern.docType) ? 'farmerId' : 'numbering', value: <span className="font-mono">{previewNumber(pattern, sequences ?? {}, { orgCode: f.org.code, initials: 'AI', region: 'UW', community: 'BUS', clientCode: 'NSB' })}</span> });
  const movement = TOLERANCE_OF[routeKey];
  if (movement) items.push({ label: t(movement === 'INBOUND' ? 'area.receivingTolerance' : 'area.transferTolerance'), page: 'inventoryRules', value: tolerances(s, movement, lang) || '—' });
  if (routeKey === 'purchases' || routeKey === 'reconciliation') items.push({ label: t('area.reconTolerance'), page: 'buyingRules', value: `${f.money(s.buyingRules.reconToleranceMinor)} · ${f.number(s.buyingRules.reconTolerancePct)}%` });
  if (routeKey === 'payments' || routeKey === 'wallets') items.push({ label: t('area.providers'), page: 'payments', value: s.paymentProviders.filter((p) => p.enabled).map((p) => p.name).join(', ') || '—' });
  if (routeKey === 'communities') items.push({ label: t('area.levels'), page: 'locations', value: s.locationLevels.map((l) => l.label[lang] ?? l.label.en).join(' → ') });
  if (!items.length) return null;

  const canEdit = can('settings.view');
  return (
    <section aria-label={t('area.title')} className="mb-6 flex flex-wrap items-stretch gap-x-8 gap-y-3 rounded-card border border-line bg-surface px-5 py-3.5">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <div className="eyebrow mb-0.5">{it.label}</div>
          <div className="text-[14px] font-medium text-ink">{it.value}</div>
        </div>
      ))}
      {canEdit && (
        <NavLink to={`/app/settings/${items[0]!.page}`} className="ml-auto inline-flex items-center gap-1.5 self-center text-[13px] font-medium text-brand hover:underline">
          <Settings2 className="h-3.5 w-3.5" /> {t('area.change')}
        </NavLink>
      )}
    </section>
  );
}

function tolerances(s: OrgSettings, movement: 'INBOUND' | 'TRANSFER', lang: 'en' | 'fr') {
  return s.commodities
    .map((c) => {
      const pct = s.inventoryRules.tolerances.find((x) => x.commodityId === c.id && x.movement === movement)?.pct ?? c.lossTolerancePct;
      return `${c.name[lang] ?? c.name.en} ${pct}%`;
    })
    .join(' · ');
}
