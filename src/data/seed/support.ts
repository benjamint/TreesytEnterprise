import type {
  ActivityEvent, Farmer, FarmerGroup, LegacyAllocation, LoanAccount, LoanRefund, Money, OrgSettings, RecordDocument, RecoveryRequest, RecoveryWindow, Repayment,
  ServiceProvider, SupportLine, SupportRequest,
} from '@/types';
import { apply, start, type WorkflowRecord, type WorkflowUser } from '@/engines/workflow';
import { buildLedger } from '@/engines/loans';
import { calculateFees } from '@/engines/money';
import { nextNumber } from '@/engines/numbering';
import type { OpsResult } from './operations';
import { Rng } from './rng';

/**
 * Phase 11 seed (PRD F, 12.5): service providers, support requests across the board's columns with
 * their payouts and loans, recovery windows, recovery requests with repayments, an overpaid loan
 * and the legacy allocations archive. Uses its own random stream so earlier data stays the same.
 */

export interface SupportSeed {
  providers: ServiceProvider[]; requests: SupportRequest[]; windows: RecoveryWindow[]; recoveries: RecoveryRequest[];
  repayments: Repayment[]; refunds: LoanRefund[]; legacy: LegacyAllocation[]; loans: LoanAccount[]; documents: RecordDocument[]; activity: ActivityEvent[];
}

interface Opts {
  orgId: string; seed: number; today: Date; lang: 'en' | 'fr'; currency: string; commodityId: string;
  creatorAgentUserId?: string; opsUserId: string; financeUserId: string; journeyGroupId?: string; produceUnitPriceMinor: number;
}

const PROVIDERS_EN: [string, string, string[], string][] = [
  ['Wa Tractor Services', 'st_plough', ['Tractor ploughing', 'Harrowing'], 'Wa'],
  ['Sissala Bullock Ploughing Group', 'st_plough', ['Bullock ploughing'], 'Tumu'],
  ['Upper West Agro Inputs', 'st_input', ['Fertilizer · NPK 15-15-15', 'Fertilizer · Urea', 'Agrochemical · Herbicide', 'Sack · Jute'], 'Wa'],
  ['Savannah Seed & Tools', 'st_input', ['Seed · Maize', 'Seed · Soya', 'Tool/Machine · Knapsack sprayer', 'Planter · Manual'], 'Tamale'],
  ['Lawra Tree Nursery', 'st_agro', ['Nursery · Shea seedlings', 'Tree planting · Mango seedlings'], 'Lawra'],
];
const PROVIDERS_FR: [string, string, string[], string][] = [
  ['Agro-Intrants Daloa', 'st_input', ['Engrais · NPK 0-23-19', 'Produits phytosanitaires · Fongicide'], 'Daloa'],
  ['Coop Services Vavoua', 'st_input', ['Engrais · Urée', 'Produits phytosanitaires · Insecticide'], 'Vavoua'],
  ['Phyto Plus Issia', 'st_input', ['Produits phytosanitaires · Herbicide'], 'Issia'],
];
const PLAN: [status: string, count: number][] = [
  ['PENDING_SCORING', 1], ['PENDING_APPROVAL', 3], ['REJECTED', 1], ['ON_HOLD', 1], ['AGENT_CONFIRMATION', 2], ['PENDING_DISBURSEMENT', 2], ['DISBURSED', 2], ['FULFILLED', 6],
];
const LEGACY_TYPES_EN: [string, string, number][] = [['Fertilizer (NPK)', 'bags', 18_000], ['Cash advance', 'GHS', 0], ['Ploughing', 'acres', 15_000], ['Seed (maize)', 'kg', 1_200], ['Knapsack sprayer', 'units', 32_000]];
const LEGACY_TYPES_FR: [string, string, number][] = [['Engrais (NPK)', 'sacs', 18_000], ['Avance en espèces', 'XOF', 0], ['Fongicide', 'litres', 6_500]];

export function seedSupport(ops: OpsResult, settings: OrgSettings, o: Opts): SupportSeed {
  const rng = new Rng(o.seed);
  const DAY = 86_400_000;
  const H = 3_600_000;
  const day = (t: number) => new Date(Math.min(t, o.today.getTime() - H)).toISOString().slice(0, 10);
  const iso = (t: number) => new Date(Math.min(t, o.today.getTime() - H)).toISOString();
  const m = (amountMinor: number): Money => ({ amountMinor: Math.round(amountMinor), currency: o.currency });
  const major = (v: number) => (o.currency === 'XOF' ? v : v * 100);
  const issue = (docType: string, date: Date) => {
    const r = nextNumber(settings.numbering.find((p) => p.docType === docType)!, ops.sequences, { date });
    ops.sequences = r.sequences;
    return r.number;
  };
  const out: SupportSeed = { providers: [], requests: [], windows: [], recoveries: [], repayments: [], refunds: [], legacy: [], loans: [], documents: [], activity: [] };
  const act = (entity: string, entityId: string, key: string, params: Record<string, unknown>, actorId: string, at: string) =>
    out.activity.push({ id: `${entityId}_act_${out.activity.length}`, orgId: o.orgId, entity, entityId, key, params, actorId, at });
  const types = settings.support.types.filter((t) => t.enabled);
  const typeOf = (id: string) => types.find((t) => t.id === id)!;
  const mobile = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY');

  // ---- Service providers ----
  (o.lang === 'fr' ? PROVIDERS_FR : PROVIDERS_EN).forEach(([name, typeId, offers, location], i) => {
    if (!types.some((t) => t.id === typeId)) return;
    const prov = mobile[i % mobile.length]!;
    const phone = o.lang === 'fr' ? `+22507${String(30_110_000 + i * 104_733).slice(0, 8)}` : `+23324${String(41_100_000 + i * 97_331).slice(0, 7)}`;
    out.providers.push({
      id: `${o.orgId}_sp_${i + 1}`, orgId: o.orgId, createdAt: iso(o.today.getTime() - (400 - i * 30) * DAY), updatedAt: iso(o.today.getTime() - 20 * DAY), createdBy: o.opsUserId,
      name, typeIds: [typeId], offers, location, phone, status: i === 1 && o.lang === 'en' ? 'INACTIVE' : 'ACTIVE', wallet: { providerId: prov.id, number: phone, name: name.toUpperCase() },
    });
  });

  // ---- Recovery windows ----
  const recoverable = types.filter((t) => t.recoverable);
  const yr = o.today.getUTCFullYear();
  const winDefs: [name: string, typeId: string, start: number, end: number, status: RecoveryWindow['status'], season: string][] = [
    [o.lang === 'fr' ? `Campagne ${yr - 1}` : `${yr - 1} main season`, recoverable[0]!.id, -380, -200, 'CLOSED', `${yr - 1}`],
    [o.lang === 'fr' ? `Campagne principale ${yr}` : `${yr} main season`, recoverable[0]!.id, -25, 75, 'ACTIVE', `${yr}`],
    ...(recoverable[1] ? [[o.lang === 'fr' ? `Intrants ${yr}` : `${typeLabel(typeOf(recoverable[1].id), o.lang)} ${yr}`, recoverable[1].id, -10, 90, 'ACTIVE', `${yr}`] as [string, string, number, number, RecoveryWindow['status'], string]] : []),
    [o.lang === 'fr' ? `Campagne ${yr + 1} (brouillon)` : `${yr + 1} early season (draft)`, recoverable[0]!.id, 200, 320, 'DRAFT', `${yr + 1}`],
  ];
  winDefs.forEach(([name, typeId, s, e, status, season], i) => {
    out.windows.push({
      id: `${o.orgId}_rw_${i + 1}`, orgId: o.orgId, createdAt: iso(o.today.getTime() + (s - 30) * DAY), updatedAt: iso(o.today.getTime() + (s - 30) * DAY), createdBy: o.financeUserId,
      name, typeId, season, commodityId: o.commodityId, start: new Date(o.today.getTime() + s * DAY).toISOString().slice(0, 10), end: new Date(o.today.getTime() + e * DAY).toISOString().slice(0, 10),
      status, remark: status === 'ACTIVE' ? (o.lang === 'fr' ? 'Remboursement en fèves de préférence.' : 'Produce repayment preferred; cash accepted with the penalty.') : undefined, reminders: { sms: status === 'ACTIVE', push: true },
    });
  });
  const closedWin = out.windows[0]!;
  const activeWin = out.windows[1]!;

  // ---- Support requests ----
  const def = settings.workflows.find((w) => w.docType === 'supportRequest')!;
  const superUser = (id: string): WorkflowUser => ({ id, roleIds: [], permissions: ['*'] });
  const membersOf = (g: FarmerGroup) => ops.groupMemberships.filter((x) => x.groupId === g.id && !x.leftAt).map((x) => ops.farmers.find((f) => f.id === x.farmerId)!).filter(Boolean) as Farmer[];
  const candidates = ops.groups.filter((g) => g.id !== o.journeyGroupId && membersOf(g).length >= 5);
  const agentFor = (g: FarmerGroup) => ops.communities.find((c) => c.id === g.communityId)?.agentIds[0] ?? ops.agents[0]!.id;
  let gi = 0;
  const amountFor = (typeId: string) => {
    const t = typeOf(typeId);
    const cap = t.maxAmountMinor || major(800);
    const step = o.currency === 'XOF' ? 500 : major(10);
    return Math.round((cap * rng.float(0.25, 0.6)) / step) * step;
  };
  for (const [status, count] of PLAN) {
    for (let k = 0; k < count; k++) {
      const g = candidates[gi++ % candidates.length]!;
      const cycle = ['st_cash', 'st_plough', 'st_input', 'st_cash', 'st_agro', 'st_plough', 'st_cash', 'st_input'].filter((id) => types.some((t) => t.id === id));
      const primary = status === 'PENDING_SCORING' ? types.find((t) => t.groupScoring)! : typeOf(cycle[gi % cycle.length] ?? types[0]!.id);
      const secondary = rng.chance(0.3) ? types.find((t) => t.id !== primary.id && t.recoverable) : undefined;
      const ageDays = status === 'FULFILLED' ? rng.int(k < 3 ? 230 : 40, k < 3 ? 300 : 70) : status === 'DISBURSED' ? rng.int(8, 20) : rng.int(1, 12);
      const created = o.today.getTime() - ageDays * DAY;
      const members = rng.shuffle(membersOf(g)).slice(0, rng.int(5, Math.min(10, membersOf(g).length)));
      const per = amountFor(primary.id);
      const lines: SupportLine[] = members.map((f, i) => ({
        id: `${g.id}_pf${gi}_l${i}`, farmerId: f.id, typeId: primary.id, subType: primary.subTypes[i % Math.max(1, primary.subTypes.length)],
        amount: m(per), landSize: primary.unit === 'ACRES' ? rng.int(1, 4) : undefined, quantity: primary.unit === 'BAGS' ? rng.int(1, 5) : undefined,
        supplyDate: primary.kind === 'INPUT' ? day(created + 10 * DAY) : undefined, abilityToPay: rng.pick(settings.support.abilityToPay), status: 'PENDING',
      }));
      const agentId = agentFor(g);
      const agentUser = ops.agents.find((a) => a.id === agentId)?.userId ?? o.opsUserId;
      const wallet = g.wallet ? { providerId: mobile.find((p) => p.id === g.wallet!.provider)?.id ?? mobile[0]!.id, number: g.wallet.number, name: g.wallet.name } : undefined;
      const base = {
        id: `${o.orgId}_pf_${out.requests.length + 1}`, orgId: o.orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: agentUser,
        number: issue('supportRequest', new Date(created)), groupId: g.id, communityId: g.communityId, agentId, primaryTypeId: primary.id, secondaryTypeId: secondary?.id,
        agroforestry: rng.chance(0.4) ? { interested: true, type: 'Parkland' } : undefined,
        gps: (() => { const c = ops.communities.find((x) => x.id === g.communityId); return c ? { lat: c.gps.lat + 0.002, lng: c.gps.lng - 0.002, accuracy: 6 } : undefined; })(),
        lines, voice: { leaderSeconds: 22 + (gi % 9), witnessSeconds: primary.evidence?.witnessVoice ? 14 + (gi % 5) : undefined }, services: [], total: m(per * lines.length),
        payout: { method: (primary.payout === 'SUPPLIER' ? 'PROVIDER' : wallet ? 'GROUP_WALLET' : 'FARMER_WALLETS') as SupportRequest['payout']['method'], wallet },
        disbursements: [], refunds: [], assets: {}, fulfilmentStatus: 'PENDING' as const, device: 'mobile' as const,
      };
      act('supportRequest', base.id, 'support.created', { number: base.number, total: base.total }, agentUser, base.createdAt);
      let r: SupportRequest;
      if (status === 'PENDING_SCORING') r = { ...base, status: 'PENDING_SCORING', approvals: [] };
      else {
        let rec = start(def, base, iso(created + H)).record as unknown as WorkflowRecord;
        const at = iso(created + 20 * H);
        if (status === 'REJECTED') rec = apply(rec, def, 'REJECT', superUser(o.opsUserId), { comment: o.lang === 'fr' ? 'Groupement déjà soutenu cette campagne' : 'Group already supported this season', at }).record;
        else if (status === 'ON_HOLD') rec = apply(rec, def, 'HOLD', superUser(o.opsUserId), { comment: o.lang === 'fr' ? 'Vérifier la liste des membres' : 'Confirm the member list with the agent', at }).record;
        else if (status !== 'PENDING_APPROVAL') rec = apply(rec, def, 'APPROVE', superUser(o.opsUserId), { at }).record;
        r = rec as unknown as SupportRequest;
      }
      const approved = !['PENDING_SCORING', 'PENDING_APPROVAL', 'REJECTED', 'ON_HOLD'].includes(status);
      if (approved) {
        const provider = out.providers.find((p) => p.typeIds.includes(primary.id) && p.status === 'ACTIVE');
        r.services = [{
          typeId: primary.id, amountPerFarmer: m(per), providerId: primary.needsProvider ? provider?.id : undefined, arrangement: primary.needsProvider ? 'PROVIDER_PAID' : undefined,
          expectedKgPerFarmer: primary.recoverable ? Math.ceil(per / o.produceUnitPriceMinor) : undefined, by: o.opsUserId, at: iso(created + 20 * H),
        }];
        if (primary.needsProvider && provider) r.payout = { method: 'PROVIDER', wallet: provider.wallet };
        r.lines = r.lines.map((l) => ({ ...l, status: 'APPROVED' }));
      }
      if (['PENDING_DISBURSEMENT', 'DISBURSED', 'FULFILLED'].includes(status)) {
        // Agent confirmation: one farmer sometimes doesn't turn up; another opts out.
        r.lines = r.lines.map((l, i) => ({ ...l, status: i === lines.length - 1 && gi % 2 === 0 ? 'REJECTED' : i === lines.length - 2 && gi % 3 === 0 ? 'DECLINED' : 'CONFIRMED' }));
        r.confirmedAt = iso(created + 30 * H);
        r.status = 'PENDING_DISBURSEMENT';
        act('supportRequest', r.id, 'support.confirmed', { count: r.lines.filter((l) => l.status === 'CONFIRMED').length }, agentUser, r.confirmedAt);
      }
      if (status === 'DISBURSED' || status === 'FULFILLED') {
        const paid = r.lines.filter((l) => l.status === 'CONFIRMED');
        const amount = m(paid.reduce((s, l) => s + l.amount.amountMinor, 0));
        const when = iso(created + 40 * H);
        const to = r.payout.wallet ?? { providerId: mobile[0]!.id, number: '+233240000000', name: 'GROUP WALLET' };
        const q = calculateFees(amount, settings.feeTiers, to.providerId, { taxPct: settings.taxPct });
        const payId = `${r.id}_pay`;
        ops.payments.unshift({
          id: payId, orgId: o.orgId, reference: issue('payment', new Date(when)), payableType: 'FARMER_SUPPORT', payableId: r.id, payee: { name: to.name, number: to.number }, providerId: to.providerId,
          amount, fee: q.fee, tax: q.tax, total: q.total, received: q.received, status: 'SUCCESSFUL', initiatedBy: o.financeUserId, createdAt: when,
        });
        r.disbursements = [{ id: `${r.id}_d1`, amount, method: 'MOMO', to: to.name, at: when, by: o.financeUserId, paymentId: payId }];
        r.lines = r.lines.map((l) => (l.status === 'CONFIRMED' ? { ...l, status: 'PAID' } : l));
        r.status = 'DISBURSED';
        act('supportRequest', r.id, 'support.disbursed', { amount, to: to.name }, o.financeUserId, when);
        // Declined farmers who were paid back what the group received for them.
        const declined = r.lines.find((l) => l.status === 'DECLINED');
        if (declined && status === 'FULFILLED') r.refunds = [{ id: `${r.id}_rf1`, farmerId: declined.farmerId, amount: declined.amount, method: 'MOMO', reference: `REF-${String(4400 + out.requests.length)}`, at: iso(created + 60 * H), by: o.financeUserId }];
        // Loans for recoverable support, one per paid farmer.
        if (primary.recoverable) {
          const win = ageDays > 200 ? closedWin : activeWin;
          r.lines = r.lines.map((l) => {
            if (l.status !== 'PAID') return l;
            const loanId = `${l.id}_loan`;
            out.loans.push({
              id: loanId, orgId: o.orgId, createdAt: when, updatedAt: when, createdBy: o.financeUserId, farmerId: l.farmerId, principal: l.amount, disbursedAt: when.slice(0, 10),
              window: { start: when.slice(0, 10), end: win.end }, repayments: [], status: 'ACTIVE', typeId: primary.id, supportRequestId: r.id, lineId: l.id, groupId: g.id,
            });
            return { ...l, loanId };
          });
        }
      }
      if (status === 'FULFILLED') {
        r.lines = r.lines.map((l, i) => (l.status === 'PAID' ? { ...l, status: 'FULFILLED', fulfilment: { audioSeconds: 12 + (i % 7), witness: i % 2 ? undefined : 'Group secretary', gps: r.gps, at: iso(created + 70 * H), by: agentUser } } : l));
        r.status = 'FULFILLED';
        r.fulfilmentStatus = 'FULL';
        r.assets = { agreement: 'agreement-signed.pdf', thumbprints: r.lines.filter((l) => l.status === 'FULFILLED').length, at: iso(created + 70 * H) };
        out.documents.push({ id: `${r.id}_doc_agreement`, orgId: o.orgId, entity: 'farmerGroup', entityId: g.id, type: 'partnershipAgreement', name: `${r.number} — support agreement.pdf`, mime: 'application/pdf', size: 96_000, uploadedBy: agentUser, uploadedAt: r.assets.at! });
        act('supportRequest', r.id, 'support.fulfilled', { count: r.assets.thumbprints }, agentUser, r.assets.at!);
      }
      if (status === 'DISBURSED' && k === 1) {
        // Partly fulfilled: the agent recorded proof for half the farmers so far.
        let n = 0;
        r.lines = r.lines.map((l) => (l.status === 'PAID' && n++ % 2 === 0 ? { ...l, status: 'FULFILLED', fulfilment: { audioSeconds: 15, gps: r.gps, at: iso(created + 60 * H), by: agentUser } } : l));
        r.fulfilmentStatus = 'PARTIAL';
      }
      out.requests.push(r);
    }
  }

  // ---- Recovery requests on fulfilled, recoverable support ----
  const terms = settings.loanTerms;
  const priceOf = (kg: number) => Math.round(kg * o.produceUnitPriceMinor);
  const recPlan: RecoveryRequest['status'][] = ['FULLY_RECOVERED', 'PARTIALLY_RECOVERED', 'ACTIVATED', 'FINANCE_REVIEW', 'PENDING_REVIEW'];
  const eligibleReqs = out.requests.filter((r) => r.status === 'FULFILLED' && typeOf(r.primaryTypeId).recoverable);
  eligibleReqs.slice(0, recPlan.length).forEach((r, i) => {
    const status = recPlan[i]!;
    const loans = out.loans.filter((l) => l.supportRequestId === r.id);
    const win = loans[0] && loans[0].window.end === closedWin.end ? closedWin : activeWin;
    const agentUser = ops.agents.find((a) => a.id === r.agentId)?.userId ?? o.opsUserId;
    const created = Math.max(new Date(r.createdAt).getTime() + 100 * DAY, o.today.getTime() - (8 - i) * DAY);
    const rr: RecoveryRequest = {
      id: `${o.orgId}_rr_${i + 1}`, orgId: o.orgId, createdAt: iso(created), updatedAt: iso(created), createdBy: agentUser, number: issue('recoveryBatch', new Date(created)),
      groupId: r.groupId, windowId: win.id, agentId: r.agentId, loanIds: loans.map((l) => l.id), status, device: 'mobile',
    };
    act('recoveryRequest', rr.id, 'recovery.created', { number: rr.number, count: loans.length }, agentUser, rr.createdAt);
    if (status !== 'PENDING_REVIEW') {
      rr.review = { commodityId: o.commodityId, unitPrice: m(o.produceUnitPriceMinor), excessPrice: m(Math.round(o.produceUnitPriceMinor * 1.05)), by: o.opsUserId, at: iso(created + 6 * H) };
      act('recoveryRequest', rr.id, 'recovery.reviewed', { price: rr.review.unitPrice }, o.opsUserId, rr.review.at);
    }
    if (['ACTIVATED', 'PARTIALLY_RECOVERED', 'FULLY_RECOVERED'].includes(status)) {
      rr.activation = { excessPrice: rr.review!.excessPrice, by: o.financeUserId, at: iso(created + 20 * H) };
      act('recoveryRequest', rr.id, 'recovery.activated', {}, o.financeUserId, rr.activation.at);
    }
    if (status === 'PARTIALLY_RECOVERED' || status === 'FULLY_RECOVERED') {
      loans.forEach((l, j) => {
        if (status === 'PARTIALLY_RECOVERED' && j % 2 === 1) return;
        const at = iso(created + (30 + j * 3) * H);
        const ledger = buildLedger(l.principal, terms, l.window, l.repayments.map((x) => ({ date: x.date, amountMinor: x.amount.amountMinor, mode: x.mode })), at.slice(0, 10), { disbursedAt: l.disbursedAt });
        const owed = ledger.balance;
        const cashShare = j % 3 === 0 && status === 'FULLY_RECOVERED';
        const kg = Math.ceil((cashShare ? owed * 0.6 : status === 'FULLY_RECOVERED' ? owed : owed * 0.5) / o.produceUnitPriceMinor);
        const produceValue = m(priceOf(kg));
        const mode: Repayment['mode'] = cashShare ? 'MIXED' : 'PRODUCE';
        // Mixed: the cash part settles the rest, with the one-time cash penalty on top (quote engine).
        const cash = cashShare ? m(Math.max(0, Math.ceil((owed - produceValue.amountMinor) * (1 + (terms.penalty.type === 'one-time-percent' ? terms.penalty.rate : 0))) + 100)) : undefined;
        const rp: Repayment = {
          id: `${l.id}_rp${j}`, orgId: o.orgId, loanId: l.id, farmerId: l.farmerId, recoveryRequestId: rr.id, agentId: rr.agentId, date: at.slice(0, 10), mode, kg,
          bagCode: `${o.lang === 'fr' ? 'KIB' : 'VB'}${String(700_000 + out.repayments.length).padStart(6, '0')}`, produceValue, cash,
          receipt: cash ? { status: j === 0 ? 'PENDING' : 'CONFIRMED', photo: 'cash-receipt.jpg', by: j === 0 ? undefined : o.financeUserId, at: j === 0 ? undefined : iso(created + 50 * H) } : { status: 'NA' },
          status: 'RECORDED', createdAt: at, createdBy: agentUser,
        };
        out.repayments.push(rp);
        l.repayments.push({ date: rp.date, amount: produceValue, mode: 'PRODUCE', repaymentId: rp.id });
        if (cash) l.repayments.push({ date: rp.date, amount: cash, mode: 'CASH', repaymentId: rp.id });
        const after = buildLedger(l.principal, terms, l.window, l.repayments.map((x) => ({ date: x.date, amountMinor: x.amount.amountMinor, mode: x.mode })), o.today, { disbursedAt: l.disbursedAt });
        if (after.settled) { l.status = 'SETTLED'; l.settledAt = at; }
      });
      if (status === 'FULLY_RECOVERED') {
        rr.feedback = { experience: settings.support.feedback?.experience[1] ?? 'Very good', lendAgain: 'YES', comment: o.lang === 'fr' ? 'Groupement sérieux, remboursement rapide.' : 'Members repaid quickly after the market.', at: iso(created + 60 * H), by: agentUser };
      }
    }
    if (rr.status === 'PARTIALLY_RECOVERED' || rr.status === 'FULLY_RECOVERED') {
      const all = loans.every((l) => l.status === 'SETTLED');
      rr.status = all ? 'FULLY_RECOVERED' : 'PARTIALLY_RECOVERED';
    }
    out.recoveries.push(rr);
  });
  // A rejected recovery (wrong group listed), never repaid.
  const lastReq = eligibleReqs[recPlan.length];
  if (lastReq) {
    const at = iso(o.today.getTime() - 3 * DAY);
    out.recoveries.push({
      id: `${o.orgId}_rr_rej`, orgId: o.orgId, createdAt: at, updatedAt: at, createdBy: o.opsUserId, number: issue('recoveryBatch', new Date(at)), groupId: lastReq.groupId, windowId: activeWin.id,
      agentId: lastReq.agentId, loanIds: out.loans.filter((l) => l.supportRequestId === lastReq.id).map((l) => l.id), status: 'REJECTED',
      rejection: { reason: o.lang === 'fr' ? 'Mauvaise fenêtre de recouvrement' : 'Wrong recovery window — resubmit for the closed season', by: o.opsUserId, at },
    });
  }

  // ---- Legacy allocations (read-only archive) ----
  const legacyTypes = o.lang === 'fr' ? LEGACY_TYPES_FR : LEGACY_TYPES_EN;
  const farmers = rng.shuffle(ops.farmers.filter((f) => f.orgId === o.orgId)).slice(0, o.lang === 'fr' ? 12 : 30);
  farmers.forEach((f, i) => {
    const [type, unit, unitPrice] = legacyTypes[i % legacyTypes.length]!;
    const quantity = unitPrice ? rng.int(1, 6) : 1;
    const amount = m(unitPrice ? unitPrice * quantity : major(rng.int(30, 120) * 10));
    const status: LegacyAllocation['status'] = i % 3 === 0 ? 'FULLY_PAID' : i % 3 === 1 ? 'PARTIALLY_PAID' : 'NOT_PAID';
    const date = day(o.today.getTime() - rng.int(500, 900) * DAY);
    const paid = status === 'FULLY_PAID' ? amount.amountMinor : status === 'PARTIALLY_PAID' ? Math.round(amount.amountMinor * rng.float(0.2, 0.7)) : 0;
    out.legacy.push({
      id: `${o.orgId}_leg_${i + 1}`, orgId: o.orgId, farmerId: f.id, type, quantity, unit, amount, repaymentMode: i % 2 ? 'MONEY' : 'FARM_PRODUCE', voiceNote: i % 4 === 0 ? 18 : undefined, date,
      repayments: paid ? [{ purchaseNumber: i % 2 ? undefined : `P-LEG-${String(1200 + i * 7)}`, amount: m(paid), date: day(new Date(date).getTime() + 150 * DAY) }] : [], status,
    });
  });
  return out;
}

function typeLabel(t: { name: Partial<Record<'en' | 'fr', string>> }, lang: 'en' | 'fr') {
  return t.name[lang] ?? t.name.en ?? '';
}
