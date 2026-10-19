import type { Money, OrgSettings, Payment, PayableType } from '@/types';
import { calculateFees } from '@/engines/money';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { transfer } from './paymentGateway';
import { useActivityStore } from '@/stores/activityStore';
import { useDemoStore } from '@/stores/demoStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Single mobile-money payouts (PRD E1, simplified for phase 7): fee and tax from the company's fee
 * tiers, the simulated provider's result after a short wait, and a retry that creates a new attempt.
 * Phase 8 adds bulk pay, maker–checker and the full payment screens on top of this.
 */

/** The network of a wallet number, from the company's provider prefixes. */
export function providerOfPhone(settings: OrgSettings, phone: string, country: string) {
  const mobile = settings.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY' && p.enabled);
  const cc = country === 'CI' ? '225' : '233';
  const digits = phone.replace(/^\+/, '');
  const local = digits.startsWith(cc) ? digits.slice(cc.length) : digits;
  const withZero = local.startsWith('0') ? local : `0${local}`;
  return mobile.find((p) => p.prefixes.some((pre) => withZero.startsWith(pre) || local.startsWith(pre))) ?? mobile[0];
}

export function quotePayout(orgId: string, amount: Money, phone: string) {
  const settings = useSettingsStore.getState().settings[orgId]!;
  const org = usePlatformStore.getState().orgs.find((o) => o.id === orgId)!;
  const provider = providerOfPhone(settings, phone, org.countries[0] ?? 'GH');
  const q = calculateFees(amount, settings.feeTiers, provider?.id ?? '', { taxPct: settings.taxPct });
  return { provider, ...q };
}

export interface PayoutInput { orgId: string; type: PayableType; payableId: string; payee: { name: string; number: string }; amount: Money; actorId: string }

/** Create the payment, wait for the provider, and return the final attempt. */
export async function payout(input: PayoutInput): Promise<Payment> {
  const { orgId } = input;
  const q = quotePayout(orgId, input.amount, input.payee.number);
  const reference = useSettingsStore.getState().issueNumber(orgId, 'payment', { date: new Date() });
  const p: Payment = {
    id: uid('pay'), orgId, reference, payableType: input.type, payableId: input.payableId, payee: input.payee, providerId: q.provider?.id ?? '',
    amount: input.amount, fee: q.fee, tax: q.tax, total: q.total, status: 'PROCESSING', initiatedBy: input.actorId, createdAt: new Date().toISOString(),
  };
  usePaymentStore.getState().addPayment(p);
  const demo = useDemoStore.getState();
  const forced = demo.failNextPayout;
  if (forced) demo.setFailNextPayout(false);
  const res = await transfer();
  const status = forced ? 'FAILED' : res.status;
  const failureReason = status === 'FAILED' ? (forced ? 'Payee wallet limit reached' : 'Provider timeout') : undefined;
  usePaymentStore.getState().updatePayment(p.id, { status, failureReason });
  useActivityStore.getState().log(makeEvent(orgId, 'payment', p.id, `payment.${status.toLowerCase()}`, { reference, amount: input.amount, name: input.payee.name }, input.actorId));
  // Company wallet balance goes down by the total on success.
  if (status === 'SUCCESSFUL' && q.provider) {
    const w = usePaymentStore.getState().wallets.find((x) => x.orgId === orgId && x.providerId === q.provider!.id);
    if (w) usePaymentStore.getState().updateWallet(w.id, { balance: { ...w.balance, amountMinor: w.balance.amountMinor - q.total.amountMinor } });
  }
  return usePaymentStore.getState().payments.find((x) => x.id === p.id)!;
}
