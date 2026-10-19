import { PageHeader } from '@/components/shared/PageHeader';
import { useBuyingStore } from '@/stores/buyingStore';
import { useOrgRows, useT } from '@/stores/hooks';
import { AggTabs, type AggTab } from './shared';
import { PurchasesTab } from './PurchasesTab';
import { SuppliersTab } from './SuppliersTab';
import { ExpensesTab } from './ExpensesTab';

/** Aggregator purchases (PRD D4): bulk purchases from traders — orders, the supplier registry and logistics expenses. */
export function AggregatorsPage({ tab }: { tab: AggTab }) {
  const { t } = useT();
  const acs = useOrgRows(useBuyingStore((s) => s.aggregatorPurchases));
  const suppliers = useOrgRows(useBuyingStore((s) => s.suppliers));
  const expenses = useOrgRows(useBuyingStore((s) => s.aggregatorExpenses));
  return (
    <>
      <PageHeader eyebrow={t('nav.section.buying')} title={t('nav.aggregators')} description={t('pages.aggregators')} />
      <AggTabs counts={{ purchases: acs.length, suppliers: suppliers.length, expenses: expenses.length }} />
      {tab === 'purchases' && <PurchasesTab />}
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'expenses' && <ExpensesTab />}
    </>
  );
}
