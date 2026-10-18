import type { Money } from '@/types';

/** Rate-card engine (PRD 8.7) for commissions and allowances. */
export interface RateCard {
  id: string;
  agentTypeId: string;
  metricKey: string;
  per: number;
  unit: string;
  rate: Money;
  eligibility: { kind: 'minValue' | 'maxValue'; value: number; noteKey: string }[];
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface RateLine {
  rateCardId: string;
  metricKey: string;
  achieved: number;
  amount: Money;
  eligible: boolean;
  notes: { key: string; params: Record<string, unknown> }[];
}

export function activeRateCards(cards: RateCard[], agentTypeId: string, on: string): RateCard[] {
  return cards.filter((c) => c.agentTypeId === agentTypeId && c.effectiveFrom <= on && (!c.effectiveTo || c.effectiveTo >= on));
}

export function computeRateLine(card: RateCard, achieved: number): RateLine {
  const notes: RateLine['notes'] = [];
  let eligible = true;
  for (const e of card.eligibility) {
    if ((e.kind === 'minValue' && achieved < e.value) || (e.kind === 'maxValue' && achieved > e.value)) {
      eligible = false;
      notes.push({ key: e.noteKey, params: { achieved, limit: e.value } });
    }
  }
  const amountMinor = eligible ? Math.round((achieved / card.per) * card.rate.amountMinor) : 0;
  return { rateCardId: card.id, metricKey: card.metricKey, achieved, amount: { amountMinor, currency: card.rate.currency }, eligible, notes };
}
