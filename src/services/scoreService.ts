import type { Community, Farmer, FarmerGroup, GroupMembership, Leader, LoanAccount, Purchase } from '@/types';
import { computeScore, type ScoreBreakdown } from '@/engines/scoring';
import { COMMUNITY_MODEL, FARMER_MODEL, GROUP_MODEL } from '@/data/templates/scoreModels';

/** Metric values for each score model, from the company's own records (PRD C2–C4). */

const yearStart = (now: Date) => new Date(now.getFullYear(), 0, 1).getTime();

export function communityScore(c: Community, ctx: { purchases: Purchase[]; leaders: Leader[]; now?: Date }): ScoreBreakdown {
  const now = ctx.now ?? new Date();
  const cf = c.customFields;
  const kg = ctx.purchases.filter((p) => p.communityId === c.id && new Date(p.createdAt).getTime() >= yearStart(now)).reduce((s, p) => s + p.quantity, 0);
  return computeScore(COMMUNITY_MODEL, {
    vsla: cf.vslaAvailable ? 1 : 0,
    leaders: ctx.leaders.some((l) => l.entity === 'community' && l.entityId === c.id) || cf.groupLeaders ? 1 : 0,
    membershipList: cf.membershipList ? 1 : 0,
    records: cf.meetingRecords || cf.contributionRecords || cf.paymentRecords ? 1 : 0,
    agreement: cf.partnershipAgreement ? 1 : 0,
    purchasesKg: kg,
    // Workshops and trees arrive in later phases; they count as zero until recorded.
    workshops: 0, treesPlanted: 0, treesAlive: 0, treeHealth: 0,
    parkland: cf.landForTreePlanting ? 1 : 0,
  });
}

export function farmerScore(f: Farmer, ctx: { purchases: Purchase[]; memberships: GroupMembership[]; loans: LoanAccount[]; now?: Date }): ScoreBreakdown {
  const now = ctx.now ?? new Date();
  const kg = ctx.purchases.filter((p) => p.farmerId === f.id && new Date(p.createdAt).getTime() >= yearStart(now)).reduce((s, p) => s + p.quantity, 0);
  const overdue = ctx.loans.some((l) => l.farmerId === f.id && l.status === 'ACTIVE' && new Date(l.window.end) < now);
  const id = f.identity;
  return computeScore(FARMER_MODEL, {
    consent: id.consent ? 1 : 0,
    identity: (id.photo ? 1 : 0) + (id.idCard ? 1 : 0) + (id.thumbprints.left && id.thumbprints.right ? 1 : 0),
    purchasesKg: kg,
    inGroup: ctx.memberships.some((m) => m.farmerId === f.id && !m.leftAt) ? 1 : 0,
    noOverdueLoan: overdue ? 0 : 1,
  });
}

export interface ManualScores {
  meetingMinutes?: number | null;
  contributionRecords?: number | null;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export function groupScore(g: FarmerGroup, ctx: { memberships: GroupMembership[]; farmers: Farmer[]; purchases: Purchase[] }): ScoreBreakdown {
  const members = ctx.memberships.filter((m) => m.groupId === g.id && !m.leftAt);
  const ids = new Set(members.map((m) => m.farmerId));
  const women = ctx.farmers.filter((f) => ids.has(f.id) && f.gender === 'F').length;
  const kg = ctx.purchases.filter((p) => ids.has(p.farmerId)).reduce((s, p) => s + p.quantity, 0);
  const manual = (g.customFields.manualScores ?? {}) as ManualScores;
  return computeScore(GROUP_MODEL, {
    members: members.length,
    womenPct: members.length ? (women / members.length) * 100 : 0,
    purchasesKg: kg,
    meetingMinutes: manual.meetingMinutes ?? null,
    contributionRecords: manual.contributionRecords ?? null,
  });
}

export { COMMUNITY_MODEL, FARMER_MODEL, GROUP_MODEL };
