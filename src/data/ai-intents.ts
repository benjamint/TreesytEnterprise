import type {
  Agent, AggregatorPurchase, Bag, Community, Farmer, FarmerGroup, LoanAccount, LocationNode, ModuleKey, OrgSettings, Payment, PreExpense,
  Purchase, PurchaseRequest, Supplier, Wallet, Warehouse,
} from '@/types';
import { buildLedger } from '@/engines/loans';
import { ancestors } from '@/engines/locations';
import { canAct, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';

/**
 * Scripted intents for "Ask your operations" (PRD B2). Each intent is a pure function of the
 * company-scoped context, so answers never include another company's data and can be tested.
 */

export type CellKind = 'text' | 'code' | 'money' | 'number' | 'kg' | 'pct' | 'date';

export interface AiTable {
  columns: { key: string; kind: CellKind }[];
  rows: Record<string, string | number>[];
}

export interface AiResult {
  /** Params for `ai.answer.{intent}` (or `.empty`). Money is minor units. */
  params: Record<string, string | number>;
  empty?: boolean;
  table?: AiTable;
  /** Bar chart over table rows: label column and value column. */
  chart?: { label: string; value: string; kind: CellKind };
  links: { key: string; to: string }[];
  /** Params for `ai.explain.{intent}`. */
  explain?: Record<string, string | number>;
}

export interface AiContext {
  orgId: string;
  userId: string;
  me: WorkflowUser;
  now: Date;
  lang: 'en' | 'fr';
  settings: OrgSettings;
  userName: (userId: string) => string;
  requests: PurchaseRequest[];
  purchases: Purchase[];
  expenses: PreExpense[];
  aggregatorPurchases: AggregatorPurchase[];
  suppliers: Supplier[];
  payments: Payment[];
  wallets: Wallet[];
  agents: Agent[];
  communities: Community[];
  farmers: Farmer[];
  groups: FarmerGroup[];
  loans: LoanAccount[];
  nodes: LocationNode[];
  warehouses: Warehouse[];
  bags: Bag[];
}

export interface AiIntent {
  key: string;
  module?: ModuleKey;
  permission: string;
  /** Every group must have one match in the normalised question (EN and FR words mixed). */
  keywords: string[][];
  /** Suggested on the dashboard bar. */
  chip?: boolean;
  /** Broad intents lose ties against specific ones ("commissions pending approval" is not "my approvals"). */
  generic?: boolean;
  run: (ctx: AiContext) => AiResult;
}

// ------------------------------------------------------------------ helpers

const DAY = 86_400_000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const top = <T,>(xs: T[], n: number, by: (x: T) => number) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);

export function normalise(text: string): string {
  return ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%-]+/g, ' ').trim()} `;
}

function agentName(ctx: AiContext, agentId: string) {
  const a = ctx.agents.find((x) => x.id === agentId);
  return a ? ctx.userName(a.userId) : agentId;
}
const communityName = (ctx: AiContext, id: string) => ctx.communities.find((c) => c.id === id)?.name ?? '—';
const commodityName = (ctx: AiContext, id: string) => {
  const c = ctx.settings.commodities.find((x) => x.id === id);
  return c ? c.name[ctx.lang] ?? c.name.en ?? c.code : id;
};
const farmerName = (f: Farmer) => `${f.firstName} ${f.lastName}`;

/** Purchases in the current calendar month, or the last 30 days when the month is still empty. */
function recentPurchases(ctx: AiContext): { rows: Purchase[]; period: 'month' | 'days30' } {
  const start = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1).getTime();
  const month = ctx.purchases.filter((p) => new Date(p.createdAt).getTime() >= start);
  if (month.length) return { rows: month, period: 'month' };
  const from = ctx.now.getTime() - 30 * DAY;
  return { rows: ctx.purchases.filter((p) => new Date(p.createdAt).getTime() >= from), period: 'days30' };
}

/** Cash an agent still holds: disbursed on received requests minus what they spent, until reconciled. */
function cashByAgent(ctx: AiContext) {
  const spent = new Map<string, number>();
  for (const p of ctx.purchases) spent.set(p.requestId, (spent.get(p.requestId) ?? 0) + p.amount.amountMinor);
  const out = new Map<string, { cash: number; requests: number }>();
  for (const r of ctx.requests) {
    if (!r.fundsReceived || r.reconciliationStatus === 'RECONCILED') continue;
    const given = sum(r.disbursements.map((d) => d.amount.amountMinor));
    const held = given - (spent.get(r.id) ?? 0);
    if (held <= 0) continue;
    const e = out.get(r.agentId) ?? { cash: 0, requests: 0 };
    e.cash += held;
    e.requests += 1;
    out.set(r.agentId, e);
  }
  return out;
}

function loanBalance(ctx: AiContext, l: LoanAccount) {
  const ledger = buildLedger(l.principal, ctx.settings.loanTerms, l.window, l.repayments.map((r) => ({ date: r.date, amountMinor: r.amount.amountMinor, mode: r.mode })), ctx.now, { disbursedAt: l.disbursedAt });
  return { ledger, repaid: sum(l.repayments.map((r) => r.amount.amountMinor)) };
}

function districtOf(ctx: AiContext, nodeId: string) {
  const level = ctx.settings.locationLevels[Math.min(1, ctx.settings.locationLevels.length - 1)]?.id;
  return ancestors(ctx.nodes, nodeId).find((n) => n.levelId === level)?.name ?? '—';
}

const empty = (links: AiResult['links'], params: AiResult['params'] = {}): AiResult => ({ empty: true, params, links });

// ------------------------------------------------------------------ intents

export const AI_INTENTS: AiIntent[] = [
  {
    key: 'agentCash', module: 'buying', permission: 'reconciliation.view', chip: true,
    keywords: [['cash', 'argent', 'especes', 'money', 'fonds'], ['agent', 'delegue', 'held', 'hold', 'holding', 'detien']],
    run: (ctx) => {
      const rows = top([...cashByAgent(ctx)].map(([agentId, v]) => ({ agent: agentName(ctx, agentId), cash: v.cash, requests: v.requests })), 10, (r) => r.cash);
      if (!rows.length) return empty([{ key: 'reconciliation', to: '/app/reconciliation' }]);
      return {
        params: { name: rows[0]!.agent, amount: rows[0]!.cash, total: sum(rows.map((r) => r.cash)), count: rows.length },
        table: { columns: [{ key: 'agent', kind: 'text' }, { key: 'cash', kind: 'money' }, { key: 'requests', kind: 'number' }], rows },
        chart: { label: 'agent', value: 'cash', kind: 'money' },
        links: [{ key: 'reconciliation', to: '/app/reconciliation' }, { key: 'agents', to: '/app/agents' }],
      };
    },
  },
  {
    key: 'topCommunities', module: 'buying', permission: 'purchases.view', chip: true, generic: true,
    keywords: [['communit', 'village']],
    run: (ctx) => {
      const { rows: ps, period } = recentPurchases(ctx);
      const by = new Map<string, { kg: number; spend: number; farmers: Set<string> }>();
      for (const p of ps) {
        const e = by.get(p.communityId) ?? { kg: 0, spend: 0, farmers: new Set() };
        e.kg += p.quantity;
        e.spend += p.amount.amountMinor;
        e.farmers.add(p.farmerId);
        by.set(p.communityId, e);
      }
      const rows = top([...by].map(([id, v]) => ({ community: communityName(ctx, id), kg: Math.round(v.kg), spend: v.spend, farmers: v.farmers.size })), 10, (r) => r.kg);
      if (!rows.length) return empty([{ key: 'purchases', to: '/app/purchases' }]);
      return {
        params: { name: rows[0]!.community, kg: rows[0]!.kg, period },
        table: { columns: [{ key: 'community', kind: 'text' }, { key: 'kg', kind: 'kg' }, { key: 'spend', kind: 'money' }, { key: 'farmers', kind: 'number' }], rows },
        chart: { label: 'community', value: 'kg', kind: 'kg' },
        links: [{ key: 'purchases', to: '/app/purchases' }, { key: 'communities', to: '/app/communities' }],
        explain: { period },
      };
    },
  },
  {
    key: 'overdueLoans', module: 'recovery', permission: 'recovery.view', chip: true,
    keywords: [['loan', 'pret', 'debt', 'dette', 'overdue', 'retard', 'owe']],
    run: (ctx) => {
      const rows = ctx.loans
        .filter((l) => l.status === 'ACTIVE' && new Date(l.window.end) < ctx.now)
        .map((l) => {
          const f = ctx.farmers.find((x) => x.id === l.farmerId);
          const { ledger } = loanBalance(ctx, l);
          return { farmer: f ? farmerName(f) : l.farmerId, code: f?.farmerCode ?? '', community: f ? communityName(ctx, f.communityId) : '—', balance: ledger.balance, days: Math.floor((ctx.now.getTime() - new Date(l.window.end).getTime()) / DAY) };
        })
        .filter((r) => r.balance > 0);
      if (!rows.length) return empty([{ key: 'recovery', to: '/app/recovery' }]);
      return {
        params: { count: rows.length, total: sum(rows.map((r) => r.balance)), name: rows[0]!.farmer, amount: rows[0]!.balance },
        table: { columns: [{ key: 'farmer', kind: 'text' }, { key: 'code', kind: 'code' }, { key: 'community', kind: 'text' }, { key: 'balance', kind: 'money' }, { key: 'days', kind: 'number' }], rows },
        links: [{ key: 'recovery', to: '/app/recovery' }, { key: 'farmers', to: '/app/farmers' }],
        explain: { policy: ctx.settings.buyingRules.debtPolicy },
      };
    },
  },
  {
    key: 'aboveList', module: 'buying', permission: 'purchaseRequests.view', chip: true,
    keywords: [['above', 'over', 'au-dessus', 'dessus', 'superieur', 'higher', 'expensive', 'cher'], ['list', 'liste', 'price', 'prix', 'request', 'demande']],
    run: (ctx) => {
      const above = ctx.requests.filter((r) => r.variancePct > 0 && !['NOT_APPROVED', 'ARCHIVED'].includes(r.status));
      const rows = top(above, 15, (r) => r.variancePct).map((r) => ({ number: r.number, agent: agentName(ctx, r.agentId), community: communityName(ctx, r.communityId), variance: r.variancePct, total: r.total.amountMinor, status: r.status }));
      if (!rows.length) return empty([{ key: 'purchaseRequests', to: '/app/purchase-requests' }]);
      return {
        params: { count: above.length, number: rows[0]!.number, pct: rows[0]!.variance },
        table: { columns: [{ key: 'number', kind: 'code' }, { key: 'agent', kind: 'text' }, { key: 'community', kind: 'text' }, { key: 'variance', kind: 'pct' }, { key: 'total', kind: 'money' }, { key: 'status', kind: 'text' }], rows },
        links: [{ key: 'purchaseRequests', to: '/app/purchase-requests' }, { key: 'priceBoard', to: '/app/price-board' }],
      };
    },
  },
  {
    key: 'lateReconciliations', module: 'buying', permission: 'reconciliation.view',
    keywords: [['reconcil', 'rapproch'], ['late', 'retard', 'overdue', 'open', 'pending', 'attente', 'not']],
    run: (ctx) => {
      const cutoff = ctx.now.getTime() - 7 * DAY;
      const rows = ctx.requests
        .filter((r) => r.fundsReceived && r.reconciliationStatus !== 'RECONCILED' && new Date(r.plannedDate).getTime() < cutoff)
        .map((r) => ({ number: r.number, agent: agentName(ctx, r.agentId), days: Math.floor((ctx.now.getTime() - new Date(r.plannedDate).getTime()) / DAY), status: r.reconciliationStatus }))
        .sort((a, b) => b.days - a.days);
      if (!rows.length) return empty([{ key: 'reconciliation', to: '/app/reconciliation' }]);
      return {
        params: { count: rows.length, days: rows[0]!.days, number: rows[0]!.number },
        table: { columns: [{ key: 'number', kind: 'code' }, { key: 'agent', kind: 'text' }, { key: 'days', kind: 'number' }, { key: 'reconStatus', kind: 'text' }], rows: rows.slice(0, 20).map((r) => ({ number: r.number, agent: r.agent, days: r.days, reconStatus: r.status })) },
        links: [{ key: 'reconciliation', to: '/app/reconciliation' }],
      };
    },
  },
  {
    key: 'openDiscrepancies', module: 'inventory', permission: 'inbound.view',
    keywords: [['discrepanc', 'ecart', 'missing', 'manquant', 'loss', 'perte']],
    run: () => empty([{ key: 'inbound', to: '/app/inventory/inbound' }]),
  },
  {
    key: 'agentsBelowTarget', module: 'fieldTeam', permission: 'agents.view',
    keywords: [['agent', 'delegue'], ['target', 'objectif', 'below', 'under', 'sous', 'perform', 'underperform']],
    run: (ctx) => {
      const rows = ctx.agents.filter((a) => a.status === 'ACTIVE' && a.weekTargetPct < 40).sort((a, b) => a.weekTargetPct - b.weekTargetPct).map((a) => ({ agent: ctx.userName(a.userId), target: a.weekTargetPct, score: a.score }));
      if (!rows.length) return empty([{ key: 'agents', to: '/app/agents' }]);
      return {
        params: { count: rows.length, all: ctx.agents.filter((a) => a.status === 'ACTIVE').length, name: rows[0]!.agent, pct: rows[0]!.target },
        table: { columns: [{ key: 'agent', kind: 'text' }, { key: 'target', kind: 'pct' }, { key: 'score', kind: 'number' }], rows },
        chart: { label: 'agent', value: 'target', kind: 'pct' },
        links: [{ key: 'agents', to: '/app/agents' }, { key: 'weeklyPlans', to: '/app/weekly-plans' }],
      };
    },
  },
  {
    key: 'failedPayouts', module: 'payments', permission: 'payments.view', chip: true,
    keywords: [['payout', 'payment', 'paiement', 'transfer', 'momo'], ['fail', 'echou', 'echec', 'unknown', 'inconnu', 'stuck', 'bloque']],
    run: (ctx) => {
      const from = ctx.now.getTime() - 7 * DAY;
      const week = ctx.payments.filter((p) => (p.status === 'FAILED' || p.status === 'UNKNOWN') && new Date(p.createdAt).getTime() >= from);
      const list = week.length ? week : ctx.payments.filter((p) => p.status === 'FAILED' || p.status === 'UNKNOWN');
      const rows = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map((p) => ({ reference: p.reference, payee: p.payee.name, provider: ctx.settings.paymentProviders.find((x) => x.id === p.providerId)?.name ?? p.providerId, amount: p.amount.amountMinor, status: p.status, date: p.createdAt }));
      if (!rows.length) return empty([{ key: 'payments', to: '/app/payments' }]);
      return {
        params: { count: list.length, total: sum(list.map((p) => p.amount.amountMinor)), unknown: list.filter((p) => p.status === 'UNKNOWN').length, period: week.length ? 'week' : 'all' },
        table: { columns: [{ key: 'reference', kind: 'code' }, { key: 'payee', kind: 'text' }, { key: 'provider', kind: 'text' }, { key: 'amount', kind: 'money' }, { key: 'status', kind: 'text' }, { key: 'date', kind: 'date' }], rows },
        links: [{ key: 'payments', to: '/app/payments' }],
      };
    },
  },
  {
    key: 'recoveryByDistrict', module: 'recovery', permission: 'recovery.view',
    keywords: [['recover', 'recouvr', 'repay', 'rembours'], ['district', 'region', 'zone', 'area', 'rate', 'taux']],
    run: (ctx) => {
      const by = new Map<string, { principal: number; repaid: number; loans: number }>();
      for (const l of ctx.loans) {
        const f = ctx.farmers.find((x) => x.id === l.farmerId);
        const d = f ? districtOf(ctx, f.locationNodeId) : '—';
        const e = by.get(d) ?? { principal: 0, repaid: 0, loans: 0 };
        e.principal += l.principal.amountMinor;
        e.repaid += loanBalance(ctx, l).repaid;
        e.loans += 1;
        by.set(d, e);
      }
      const rows = [...by].map(([district, v]) => ({ district, loans: v.loans, principal: v.principal, repaid: v.repaid, rate: v.principal ? round((v.repaid / v.principal) * 100) : 0 }));
      if (!rows.length) return empty([{ key: 'recovery', to: '/app/recovery' }]);
      const p = sum(rows.map((r) => r.principal));
      return {
        params: { rate: p ? round((sum(rows.map((r) => r.repaid)) / p) * 100) : 0, count: rows.length },
        table: { columns: [{ key: 'district', kind: 'text' }, { key: 'loans', kind: 'number' }, { key: 'principal', kind: 'money' }, { key: 'repaid', kind: 'money' }, { key: 'rate', kind: 'pct' }], rows },
        chart: { label: 'district', value: 'rate', kind: 'pct' },
        links: [{ key: 'recovery', to: '/app/recovery' }],
      };
    },
  },
  {
    key: 'plotsMissing', module: 'eudr', permission: 'eudr.view',
    keywords: [['plot', 'parcel', 'polygon', 'eudr', 'deforest', 'map', 'cartograph']],
    run: (ctx) => {
      const eudr = new Set(ctx.settings.commodities.filter((c) => c.eudrRelevant).map((c) => c.id));
      const missing = ctx.purchases.filter((p) => eudr.has(p.commodityId) && !p.plotId);
      if (!eudr.size || !missing.length) return empty([{ key: 'plots', to: '/app/plots' }, { key: 'eudr', to: '/app/eudr' }], { eudr: eudr.size });
      const by = new Map<string, { purchases: number; kg: number; farmers: Set<string> }>();
      for (const p of missing) {
        const e = by.get(p.communityId) ?? { purchases: 0, kg: 0, farmers: new Set() };
        e.purchases += 1;
        e.kg += p.quantity;
        e.farmers.add(p.farmerId);
        by.set(p.communityId, e);
      }
      const rows = top([...by].map(([id, v]) => ({ community: communityName(ctx, id), farmers: v.farmers.size, purchases: v.purchases, kg: Math.round(v.kg) })), 15, (r) => r.kg);
      return {
        params: { count: new Set(missing.map((p) => p.farmerId)).size, kg: Math.round(sum(missing.map((p) => p.quantity))), commodity: commodityName(ctx, [...eudr][0]!) },
        table: { columns: [{ key: 'community', kind: 'text' }, { key: 'farmers', kind: 'number' }, { key: 'purchases', kind: 'number' }, { key: 'kg', kind: 'kg' }], rows },
        links: [{ key: 'plots', to: '/app/plots' }, { key: 'eudr', to: '/app/eudr' }],
      };
    },
  },
  {
    key: 'noConsent', module: 'farmers', permission: 'farmers.view',
    keywords: [['consent', 'consentement']],
    run: (ctx) => {
      const missing = ctx.farmers.filter((f) => !f.identity.consent);
      if (!missing.length) return empty([{ key: 'farmers', to: '/app/farmers' }]);
      const by = new Map<string, number>();
      for (const f of missing) by.set(f.communityId, (by.get(f.communityId) ?? 0) + 1);
      const rows = top([...by].map(([id, n]) => ({ community: communityName(ctx, id), farmers: n })), 15, (r) => r.farmers);
      return {
        params: { count: missing.length, all: ctx.farmers.length, pct: round((missing.length / Math.max(1, ctx.farmers.length)) * 100) },
        table: { columns: [{ key: 'community', kind: 'text' }, { key: 'farmers', kind: 'number' }], rows },
        chart: { label: 'community', value: 'farmers', kind: 'number' },
        links: [{ key: 'farmers', to: '/app/farmers' }, { key: 'dataQuality', to: '/app/data-quality' }],
      };
    },
  },
  {
    key: 'stockAvailable', module: 'inventory', permission: 'warehouses.view', generic: true,
    keywords: [['stock', 'inventor', 'available', 'disponible', 'warehouse', 'magasin', 'contract', 'contrat']],
    run: (ctx) => {
      const inStock = ctx.bags.filter((b) => b.status === 'IN_STOCK' && b.warehouseId);
      if (!inStock.length) return empty([{ key: 'warehouses', to: '/app/warehouses' }]);
      const by = new Map<string, { kg: number; bags: number }>();
      for (const b of inStock) {
        const k = `${b.warehouseId}|${b.commodityId}`;
        const e = by.get(k) ?? { kg: 0, bags: 0 };
        e.kg += b.weightKg;
        e.bags += 1;
        by.set(k, e);
      }
      const rows = top([...by].map(([k, v]) => {
        const [w, c] = k.split('|');
        return { warehouse: ctx.warehouses.find((x) => x.id === w)?.name ?? w!, commodity: commodityName(ctx, c!), bags: v.bags, kg: Math.round(v.kg) };
      }), 20, (r) => r.kg);
      return {
        params: { kg: Math.round(sum(inStock.map((b) => b.weightKg))), warehouses: new Set(inStock.map((b) => b.warehouseId)).size },
        table: { columns: [{ key: 'warehouse', kind: 'text' }, { key: 'commodity', kind: 'text' }, { key: 'bags', kind: 'number' }, { key: 'kg', kind: 'kg' }], rows },
        chart: { label: 'warehouse', value: 'kg', kind: 'kg' },
        links: [{ key: 'warehouses', to: '/app/warehouses' }, { key: 'salesContracts', to: '/app/sales-contracts' }],
      };
    },
  },
  {
    key: 'ordersInTransit', module: 'dispatch', permission: 'dispatch.view',
    keywords: [['transit', 'shipment', 'expedition', 'dispatch', 'order', 'commande', 'deliver', 'livr']],
    run: (ctx) => {
      const acs = ctx.aggregatorPurchases.filter((a) => a.orderStatus === 'IN_TRANSIT');
      if (!acs.length) return empty([{ key: 'dispatch', to: '/app/dispatch' }]);
      const rows = acs.map((a) => ({ number: a.number, supplier: ctx.suppliers.find((s) => s.id === a.supplierId)?.name ?? '—', commodity: commodityName(ctx, a.commodityId), kg: a.expectedKg, date: a.plannedDate }));
      return {
        params: { count: rows.length, kg: sum(rows.map((r) => r.kg)) },
        table: { columns: [{ key: 'number', kind: 'code' }, { key: 'supplier', kind: 'text' }, { key: 'commodity', kind: 'text' }, { key: 'kg', kind: 'kg' }, { key: 'date', kind: 'date' }], rows },
        links: [{ key: 'aggregators', to: '/app/aggregators' }, { key: 'dispatch', to: '/app/dispatch' }],
      };
    },
  },
  { key: 'nurserySurvival', module: 'nurseries', permission: 'nurseries.view', keywords: [['nurser', 'pepinier', 'seedling', 'plant']], run: () => empty([{ key: 'nurseries', to: '/app/nurseries' }]) },
  { key: 'commissionsPending', module: 'commissions', permission: 'compensation.view', keywords: [['commission']], run: () => empty([{ key: 'compensation', to: '/app/compensation' }]) },
  { key: 'budgetsWaiting', module: 'weeklyBudgets', permission: 'budgets.view', keywords: [['budget']], run: () => empty([{ key: 'budgets', to: '/app/budgets' }]) },
  { key: 'carbonSurvival', module: 'carbon', permission: 'carbon.view', keywords: [['carbon', 'carbone', 'tree survival', 'survie']], run: () => empty([{ key: 'carbon', to: '/app/carbon' }]) },
  {
    key: 'topSuppliers', module: 'aggregators', permission: 'aggregators.view', generic: true,
    keywords: [['supplier', 'fournisseur', 'aggregator', 'agregateur', 'trader']],
    run: (ctx) => {
      const by = new Map<string, { kg: number; total: number; orders: number }>();
      for (const a of ctx.aggregatorPurchases.filter((x) => x.status !== 'REJECTED')) {
        const e = by.get(a.supplierId) ?? { kg: 0, total: 0, orders: 0 };
        e.kg += a.expectedKg;
        e.total += a.total.amountMinor;
        e.orders += 1;
        by.set(a.supplierId, e);
      }
      const rows = top([...by].map(([id, v]) => ({ supplier: ctx.suppliers.find((s) => s.id === id)?.name ?? id, orders: v.orders, kg: v.kg, total: v.total })), 10, (r) => r.kg);
      if (!rows.length) return empty([{ key: 'aggregators', to: '/app/aggregators' }]);
      return {
        params: { name: rows[0]!.supplier, kg: rows[0]!.kg, count: rows.length },
        table: { columns: [{ key: 'supplier', kind: 'text' }, { key: 'orders', kind: 'number' }, { key: 'kg', kind: 'kg' }, { key: 'total', kind: 'money' }], rows },
        chart: { label: 'supplier', value: 'kg', kind: 'kg' },
        links: [{ key: 'aggregators', to: '/app/aggregators' }],
      };
    },
  },
  {
    key: 'womenShare', module: 'farmers', permission: 'farmers.view', chip: true,
    keywords: [['women', 'woman', 'female', 'femme', 'gender', 'genre']],
    run: (ctx) => {
      const sellers = new Set(ctx.purchases.map((p) => p.farmerId));
      const sold = ctx.farmers.filter((f) => sellers.has(f.id));
      const base = sold.length ? sold : ctx.farmers;
      if (!base.length) return empty([{ key: 'farmers', to: '/app/farmers' }]);
      const women = base.filter((f) => f.gender === 'F');
      const spend = new Map<string, number>();
      for (const p of ctx.purchases) spend.set(p.farmerId, (spend.get(p.farmerId) ?? 0) + p.amount.amountMinor);
      const share = (g: 'F' | 'M') => sum(base.filter((f) => f.gender === g).map((f) => spend.get(f.id) ?? 0));
      const rows = (['F', 'M'] as const).map((g) => ({ gender: g, farmers: base.filter((f) => f.gender === g).length, spend: share(g) }));
      return {
        params: { pct: round((women.length / base.length) * 100), count: women.length, all: base.length, spendPct: round((share('F') / Math.max(1, share('F') + share('M'))) * 100) },
        table: { columns: [{ key: 'gender', kind: 'text' }, { key: 'farmers', kind: 'number' }, { key: 'spend', kind: 'money' }], rows },
        links: [{ key: 'farmers', to: '/app/farmers' }, { key: 'reports', to: '/app/reports' }],
      };
    },
  },
  {
    key: 'dqByAgent', module: 'dataQuality', permission: 'dataQuality.view',
    keywords: [['quality', 'qualite', 'flag', 'issue', 'probleme', 'error', 'erreur', 'duplicate', 'doublon']],
    run: (ctx) => {
      const flagged = ctx.farmers.filter((f) => f.qualityStatus === 'FLAGGED');
      if (!flagged.length) return empty([{ key: 'dataQuality', to: '/app/data-quality' }]);
      const by = new Map<string, number>();
      for (const f of flagged) by.set(f.agentId, (by.get(f.agentId) ?? 0) + 1);
      const rows = top([...by].map(([id, n]) => ({ agent: agentName(ctx, id), issues: n })), 10, (r) => r.issues);
      return {
        params: { count: flagged.length, name: rows[0]!.agent, issues: rows[0]!.issues },
        table: { columns: [{ key: 'agent', kind: 'text' }, { key: 'issues', kind: 'number' }], rows },
        chart: { label: 'agent', value: 'issues', kind: 'number' },
        links: [{ key: 'dataQuality', to: '/app/data-quality' }, { key: 'agents', to: '/app/agents' }],
      };
    },
  },
  {
    key: 'myApprovals', permission: 'dashboard.view', generic: true,
    keywords: [['approv', 'valid', 'waiting', 'attente', 'attend', 'queue', 'pending', 'me', 'my', 'moi', 'mes', 'mon']],
    run: (ctx) => {
      const wf = (t: string) => ctx.settings.workflows.find((w) => w.docType === t);
      const items: Record<string, string | number>[] = [];
      const add = (rows: { id: string; number: string; total: { amountMinor: number }; status: string }[], type: string) => {
        const def = wf(type);
        if (def) for (const r of rows) if (canAct(r as unknown as WorkflowRecord, def, ctx.me)) items.push({ number: r.number, docType: type, total: r.total.amountMinor, status: r.status });
      };
      if (ctx.settings.modules.buying) add(ctx.requests, 'purchaseRequest');
      if (ctx.settings.modules.buying) add(ctx.expenses, 'preExpense');
      if (ctx.settings.modules.aggregators) add(ctx.aggregatorPurchases, 'aggregatorPurchase');
      if (!items.length) return empty([{ key: 'dashboard', to: '/app/dashboard' }]);
      return {
        params: { count: items.length, total: sum(items.map((i) => Number(i.total))), types: new Set(items.map((i) => i.docType)).size },
        table: { columns: [{ key: 'number', kind: 'code' }, { key: 'docType', kind: 'text' }, { key: 'total', kind: 'money' }, { key: 'status', kind: 'text' }], rows: items },
        links: [{ key: 'dashboard', to: '/app/dashboard' }, { key: 'purchaseRequests', to: '/app/purchase-requests' }],
      };
    },
  },
  {
    key: 'spendByCommodity', module: 'buying', permission: 'purchases.view', generic: true,
    keywords: [['spend', 'spent', 'depens', 'volume', 'bought', 'achete', 'purchas', 'achat'], ['commodit', 'produit', 'crop', 'culture', 'month', 'mois', 'total']],
    run: (ctx) => {
      const { rows: ps, period } = recentPurchases(ctx);
      if (!ps.length) return empty([{ key: 'purchases', to: '/app/purchases' }]);
      const by = new Map<string, { kg: number; spend: number }>();
      for (const p of ps) {
        const e = by.get(p.commodityId) ?? { kg: 0, spend: 0 };
        e.kg += p.quantity;
        e.spend += p.amount.amountMinor;
        by.set(p.commodityId, e);
      }
      const rows = top([...by].map(([id, v]) => ({ commodity: commodityName(ctx, id), kg: Math.round(v.kg), spend: v.spend, price: v.kg ? Math.round(v.spend / v.kg) : 0 })), 10, (r) => r.spend);
      return {
        params: { total: sum(rows.map((r) => r.spend)), kg: sum(rows.map((r) => r.kg)), period },
        table: { columns: [{ key: 'commodity', kind: 'text' }, { key: 'kg', kind: 'kg' }, { key: 'spend', kind: 'money' }, { key: 'price', kind: 'money' }], rows },
        chart: { label: 'commodity', value: 'spend', kind: 'money' },
        links: [{ key: 'purchases', to: '/app/purchases' }, { key: 'reports', to: '/app/reports' }],
        explain: { period },
      };
    },
  },
  {
    key: 'walletBalances', module: 'payments', permission: 'wallets.view',
    keywords: [['wallet', 'portefeuille', 'balance', 'solde', 'float']],
    run: (ctx) => {
      if (!ctx.wallets.length) return empty([{ key: 'wallets', to: '/app/payments/wallets' }]);
      const rows = ctx.wallets.map((w) => ({ wallet: w.name, provider: ctx.settings.paymentProviders.find((p) => p.id === w.providerId)?.name ?? w.providerId, balance: w.balance.amountMinor, low: w.balance.amountMinor < w.lowBalanceThreshold.amountMinor ? 1 : 0 }));
      const low = rows.filter((r) => r.low);
      return {
        params: { total: sum(rows.map((r) => r.balance)), count: rows.length, low: low.length, name: low[0]?.wallet ?? '' },
        table: { columns: [{ key: 'wallet', kind: 'text' }, { key: 'provider', kind: 'text' }, { key: 'balance', kind: 'money' }], rows: rows.map(({ low: _low, ...r }) => r) },
        chart: { label: 'wallet', value: 'balance', kind: 'money' },
        links: [{ key: 'wallets', to: '/app/payments/wallets' }],
      };
    },
  },
  {
    key: 'riskyRequests', module: 'buying', permission: 'purchaseRequests.view',
    keywords: [['risk', 'risque', 'suspicious', 'suspect', 'fraud', 'fraude', 'anomal']],
    run: (ctx) => {
      const rows = ctx.requests.filter((r) => r.riskFlags.length && !['NOT_APPROVED', 'ARCHIVED', 'RECONCILED'].includes(r.status)).map((r) => ({ number: r.number, agent: agentName(ctx, r.agentId), risk: r.riskFlags.some((f) => f.severity === 'HIGH') ? 'HIGH' : r.riskFlags.some((f) => f.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW', flags: r.riskFlags.map((f) => f.key).join(', '), total: r.total.amountMinor }));
      if (!rows.length) return empty([{ key: 'purchaseRequests', to: '/app/purchase-requests' }]);
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
      rows.sort((a, b) => order[a.risk as keyof typeof order] - order[b.risk as keyof typeof order]);
      return {
        params: { count: rows.length, high: rows.filter((r) => r.risk === 'HIGH').length, number: rows[0]!.number },
        table: { columns: [{ key: 'number', kind: 'code' }, { key: 'agent', kind: 'text' }, { key: 'risk', kind: 'text' }, { key: 'flags', kind: 'text' }, { key: 'total', kind: 'money' }], rows: rows.slice(0, 20) },
        links: [{ key: 'purchaseRequests', to: '/app/purchase-requests' }],
      };
    },
  },
];

/** Best intent for a question: all keyword groups must match; more matched words wins. */
export function matchIntent(question: string): AiIntent | null {
  const q = normalise(question);
  let best: { intent: AiIntent; score: number } | null = null;
  for (const intent of AI_INTENTS) {
    let score = 0;
    let ok = true;
    for (const group of intent.keywords) {
      const hits = group.filter((k) => q.includes(k.includes(' ') ? k : k.length <= 3 ? ` ${k} ` : k)).length;
      if (!hits) {
        ok = false;
        break;
      }
      score += hits + group.length * 0.01;
    }
    score += intent.keywords.length - (intent.generic ? 2 : 0);
    if (ok && (!best || score > best.score)) best = { intent, score };
  }
  return best?.intent ?? null;
}
