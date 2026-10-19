import type { AggregatorExpense, AggregatorPurchase, OrgSettings, RecordDocument, Supplier } from '@/types';
import { apply, start, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';
import { aggResult, toCompany } from '@/engines/aggregators';
import { calculateFees } from '@/engines/money';
import { nextNumber } from '@/engines/numbering';
import type { OpsResult } from './operations';

/**
 * Phase 10 details layered on the generated aggregator data, without drawing from the random
 * stream: supplier KYC and approval, disbursements matching the seeded payouts, truck loading and
 * proof of delivery consistent with each order's payment status, and aggregator expenses (ACSPRE).
 */

const DRIVERS = [['Abdul-Rahman Yakubu', 'GR 4521-21'], ['Kofi Boadu', 'NR 1180-19'], ['Issah Mahama', 'UW 902-22'], ['Mensah Agyei', 'GT 6634-20']];
const DRIVERS_FR = [['Bakary Coulibaly', '4521 GH 01'], ['Yao Konan', '1180 FK 01'], ['Drissa Ouattara', '902 EP 01']];
const ID_TYPES = ['Ghana Card', 'Passport', 'Business registration'];

export function enrichAggregators(ops: OpsResult, settings: OrgSettings, opts: { creatorId: string; opsUserId: string; financeUserId: string; today: Date; lang: 'en' | 'fr'; customer: string }): RecordDocument[] {
  const DAY = 86_400_000;
  const H = 3_600_000;
  const iso = (t: number) => new Date(Math.min(t, opts.today.getTime() - H)).toISOString();
  const currency = settings.priceList[0]?.price.currency ?? (opts.lang === 'fr' ? 'XOF' : 'GHS');
  const issue = (docType: string, date: Date) => {
    const r = nextNumber(settings.numbering.find((p) => p.docType === docType)!, ops.sequences, { date });
    ops.sequences = r.sequences;
    return r.number;
  };
  const docs: RecordDocument[] = [];
  const doc = (entity: RecordDocument['entity'], entityId: string, type: string, name: string, at: string, by: string, mime = 'application/pdf') =>
    docs.push({ id: `${entityId}_doc_${docs.length + 1}`, orgId: ops.suppliers[0]?.orgId ?? '', entity, entityId, type, name, mime, size: 120_000 + docs.length * 3_100, uploadedBy: by, uploadedAt: at });

  // ---- Suppliers: contact, KYC, approval ----
  ops.suppliers.forEach((s: Supplier, i) => {
    const slug = s.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
    s.contactPerson = s.kind === 'COMPANY' ? (opts.lang === 'fr' ? ['Mamadou Diallo', 'Awa Sanogo', 'Konan Kouadio'] : ['Abdulai Seidu', 'Memuna Iddrisu', 'Kwesi Nyarko', 'Zenabu Alhassan'])[i % (opts.lang === 'fr' ? 3 : 4)] : s.name;
    s.email = `contact@${slug.slice(0, 18)}.example`;
    s.idType = s.kind === 'COMPANY' ? (opts.lang === 'fr' ? 'RCCM' : ID_TYPES[2]) : opts.lang === 'fr' ? 'CNI' : ID_TYPES[i % 2];
    s.idNumber = s.kind === 'COMPANY' ? `${opts.lang === 'fr' ? 'CI-ABJ' : 'CS'}-${String(104_221 + i * 3_917).padStart(7, '0')}` : `${opts.lang === 'fr' ? 'C' : 'GHA'}-${String(7_140_113 + i * 11_003)}-${i % 9}`;
    if (s.payout.method === 'BANK') s.payout.accountName = s.name.toUpperCase();
    if (s.status === 'APPROVED') { s.approvedBy = opts.opsUserId; s.approvedAt = iso(new Date(s.createdAt).getTime() + 2 * DAY); }
    doc('supplier', s.id, 'kyc', `${s.idType}-${s.idNumber}.pdf`, s.createdAt, opts.creatorId);
    if (s.kind === 'COMPANY') doc('supplier', s.id, 'businessRegistration', `${opts.lang === 'fr' ? 'statuts' : 'certificate-of-incorporation'}.pdf`, s.createdAt, opts.creatorId);
  });

  // ---- Aggregator purchases: list price, files, disbursements, delivery and proof ----
  let delivered = 0;
  const listOf = (commodityId: string) => settings.priceList.find((p) => p.commodityId === commodityId)?.price;
  ops.aggregatorPurchases.forEach((a: AggregatorPurchase, i) => {
    const created = new Date(a.createdAt).getTime();
    const list = listOf(a.commodityId);
    if (list) a.listPrice = a.dealCurrency === list.currency ? list : toCompany(list, 1 / a.exchangeRate, a.dealCurrency);
    a.poFile = `${a.poNumber}.pdf`;
    doc('aggregatorPurchase', a.id, 'poFile', a.poFile, a.createdAt, a.createdBy);
    const companyTotal = toCompany(a.total, a.exchangeRate, currency).amountMinor;
    // Disbursements: the seeded mobile-money payouts, or a manual bank transfer with proof.
    const paid = ops.payments.filter((p) => p.payableId === a.id && p.status === 'SUCCESSFUL');
    if (['PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'].includes(a.status)) {
      a.disbursements = paid.length
        ? paid.map((p, k) => ({ id: `${a.id}_d${k + 1}`, amount: p.amount, method: 'MOMO' as const, at: p.createdAt, by: p.initiatedBy, paymentId: p.id }))
        : [{ id: `${a.id}_d1`, amount: { amountMinor: a.status === 'PARTIALLY_DISBURSED' ? Math.round(companyTotal * 0.5) : companyTotal, currency }, method: 'MANUAL' as const, at: iso(created + 2 * DAY), by: opts.financeUserId }];
      if (!paid.length) doc('aggregatorPurchase', a.id, 'proof', `bank-transfer-${a.poNumber}.pdf`, iso(created + 2 * DAY), opts.financeUserId);
    }
    if (a.orderStatus === 'IN_TRANSIT' || a.orderStatus === 'DELIVERED') {
      const [driver, plate] = (opts.lang === 'fr' ? DRIVERS_FR : DRIVERS)[i % (opts.lang === 'fr' ? 3 : 4)]!;
      const at = iso(created + 4 * DAY);
      a.delivery = { driver: driver!, contact: `${opts.lang === 'fr' ? '+225 07' : '+233 24'} ${String(4_410_000 + i * 7_331).slice(0, 3)} ${String(1000 + i * 37).slice(0, 4)}`, plate: plate!, bags: a.expectedBags, kg: Math.round(a.expectedKg * 0.998), waybill: `WB-${String(30_120 + i * 13)}`, at, by: a.createdBy };
      doc('aggregatorPurchase', a.id, 'waybill', `${a.delivery.waybill}.pdf`, at, a.createdBy);
    }
    if (a.orderStatus === 'DELIVERED') {
      // Delivered kg chosen so the computed result matches the order's seeded payment status.
      const target = (['RECEIVE_REFUND', 'FULFILLED', 'REFUND_SUPPLIER', 'RECONCILED'] as const)[delivered++ % 4];
      const paidMinor = a.disbursements.reduce((s, d) => s + d.amount.amountMinor, 0) || companyTotal;
      const kgPaid = (paidMinor / companyTotal) * a.expectedKg;
      const factor = target === 'RECEIVE_REFUND' ? 0.955 : target === 'REFUND_SUPPLIER' ? 1.035 : 0.9995;
      const at = iso(created + 6 * DAY);
      a.proof = { customer: opts.customer, bags: a.expectedBags - (target === 'RECEIVE_REFUND' ? 3 : 0), kg: Math.round(kgPaid * factor), unitPrice: a.unitPrice, weighbridge: `weighbridge-${a.poNumber}.pdf`, invoice: `invoice-${a.poNumber}.pdf`, qualityReport: `quality-${a.poNumber}.pdf`, at, by: opts.opsUserId };
      for (const [type, name] of [['weighbridge', a.proof.weighbridge], ['invoice', a.proof.invoice], ['qualityReport', a.proof.qualityReport]] as const) doc('aggregatorPurchase', a.id, type, name!, at, opts.opsUserId);
      if (target === 'RECONCILED') { a.reconciledAt = iso(created + 8 * DAY); a.reconciledBy = opts.financeUserId; }
      a.paymentStatus = aggResult(a, settings.buyingRules, currency).status;
    }
  });

  // ---- Aggregator expenses (ACSPRE) ----
  const def = settings.workflows.find((w) => w.docType === 'aggregatorExpense');
  const types = settings.expenseTypes.filter((x) => (x.appliesTo ?? ['PRE']).includes('ACSPRE'));
  if (!def || !types.length) return docs;
  const super_ = (id: string): WorkflowUser => ({ id, roleIds: [], permissions: ['*'] });
  const eligible = ops.aggregatorPurchases.filter((a) => ['APPROVED', 'PARTIALLY_DISBURSED', 'FUNDS_DISBURSED'].includes(a.status));
  eligible.forEach((a, i) => {
    if (i % 3 === 2) return;
    const sup = ops.suppliers.find((s) => s.id === a.supplierId)!;
    const at = new Date(Math.min(new Date(a.createdAt).getTime() + DAY, opts.today.getTime() - 2 * H));
    const picks = [types[(i * 3) % types.length]!, types[(i * 3 + 7) % types.length]!, types[(i * 3 + 13) % types.length]!].filter((x, k, arr) => arr.indexOf(x) === k).slice(0, 2 + (i % 2));
    const lines = picks.map((x) => {
      const quantity = x.basis === 'PER_BAG' ? a.expectedBags : x.basis === 'PER_KG' ? a.expectedKg : 1;
      const rate = { amountMinor: x.defaultRate.amountMinor, currency };
      const raw = rate.amountMinor * quantity;
      return { expenseTypeId: x.id, quantity, rate, amount: { amountMinor: x.cap ? Math.min(x.cap.amountMinor, raw) : raw, currency } };
    });
    const total = { amountMinor: lines.reduce((s, l) => s + l.amount.amountMinor, 0), currency };
    const payee = sup.payout.method === 'MOMO' ? { name: sup.name.toUpperCase(), providerId: sup.payout.providerOrBank, number: sup.payout.number } : { name: (opts.lang === 'fr' ? 'TRANSPORTS KONÉ & FILS' : 'SEIDU HAULAGE SERVICES'), providerId: settings.paymentProviders.find((p) => p.kind === 'MOBILE_MONEY')!.id, number: opts.lang === 'fr' ? '+2250707445566' : '+233244556677' };
    const base = {
      id: `${a.id}_pre`, orgId: a.orgId, createdAt: at.toISOString(), updatedAt: at.toISOString(), createdBy: opts.creatorId, number: issue('aggregatorExpense', at),
      aggregatorPurchaseId: a.id, bags: a.expectedBags, lines, total, payee, paymentStatus: 'NOT_PAID' as const,
    };
    let rec = start(def, base, at.toISOString()).record as unknown as WorkflowRecord;
    const steps = a.status === 'FUNDS_DISBURSED' ? 2 : a.status === 'PARTIALLY_DISBURSED' ? 1 : 0;
    const approvers = [opts.opsUserId, opts.financeUserId];
    for (let k = 0; k < steps; k++) rec = apply(rec, def, 'APPROVE', super_(approvers[k]!), { at: iso(at.getTime() + (k + 1) * 6 * H) }).record;
    const e = rec as unknown as AggregatorExpense;
    if (e.status === def.approvedStatus && i % 2 === 0) {
      const when = iso(at.getTime() + 20 * H);
      const q = calculateFees(total, settings.feeTiers, payee.providerId, { taxPct: settings.taxPct });
      const id = `${e.id}_pay`;
      ops.payments.unshift({
        id, orgId: e.orgId, reference: issue('payment', new Date(when)), payableType: 'AGGREGATOR_EXPENSE', payableId: e.id, payee: { name: payee.name, number: payee.number }, providerId: payee.providerId,
        amount: total, fee: q.fee, tax: q.tax, total: q.total, received: q.received, status: 'SUCCESSFUL', initiatedBy: opts.financeUserId, createdAt: when,
      });
      e.paymentStatus = 'PAID';
      e.disbursement = { method: 'MOMO', at: when, by: opts.financeUserId, paymentId: id };
    }
    ops.aggregatorExpenses.push(e);
  });
  return docs;
}
