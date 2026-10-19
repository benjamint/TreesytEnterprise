import type { Community, Farmer, FarmerGroup, GroupMembership, Leader, OrgSettings, Purchase, QualityIssue, RecordDocument, SavingsEntry } from '@/types';
import { checkEntity } from '@/engines/rules';
import { groupScore } from '@/services/scoreService';
import { pad } from './rng';

/**
 * Phase 5 seed: ID numbers, leaders, documents, VSLA savings and the data-quality issues the
 * company's rules raise on the seeded records. Deterministic and RNG-free so earlier demo
 * moments (cash held, loans) don't move.
 */

const ID_PREFIX: Record<string, string> = { ghanaCard: 'GHA-', votersId: 'VID-', nhis: 'NHIS-', cni: 'CI', carteProducteur: 'CP-' };

export function assignIdNumbers(farmers: Farmer[]) {
  farmers.forEach((f, i) => {
    const type = String(f.customFields.idType ?? 'none');
    if (type === 'none' || !ID_PREFIX[type]) return;
    f.customFields.idNumber = `${ID_PREFIX[type]}${pad(100_000_000 + ((i + 1) * 7_919_007) % 899_999_999, 9)}`;
  });
  // Two registrations of the same ID card: a duplicate the data-quality queue should catch.
  const withId = farmers.filter((f) => f.customFields.idNumber);
  if (withId.length > 40) withId[37]!.customFields.idNumber = withId[12]!.customFields.idNumber;
}

const ROLES: Record<string, string[]> = {
  en: ['Chief', 'Magazia (women leader)', 'Assembly member', 'Youth leader'],
  fr: ['Chef du village', 'Présidente des femmes', 'Notable', 'Président des jeunes'],
};

export function seedLeaders(orgId: string, lang: 'en' | 'fr', communities: Community[], groups: FarmerGroup[], memberships: GroupMembership[], farmers: Farmer[], at: string): Leader[] {
  const roles = ROLES[lang]!;
  const out: Leader[] = [];
  communities.forEach((c, i) => {
    out.push({ id: `${c.id}_ld0`, orgId, entity: 'community', entityId: c.id, name: c.contactPerson.name, role: roles[0]!, phone: c.contactPerson.phone, createdAt: c.profiledAt });
    const extra = farmers.filter((f) => f.communityId === c.id).slice(0, 1 + (i % 2));
    extra.forEach((f, j) => out.push({ id: `${c.id}_ld${j + 1}`, orgId, entity: 'community', entityId: c.id, name: `${f.firstName} ${f.lastName}`, role: roles[1 + ((i + j) % 3)]!, phone: f.phone, gender: f.gender, createdAt: c.profiledAt }));
  });
  const byId = new Map(farmers.map((f) => [f.id, f]));
  for (const g of groups) {
    for (const m of memberships.filter((x) => x.groupId === g.id && x.role !== 'MEMBER')) {
      const f = byId.get(m.farmerId);
      if (f) out.push({ id: `${m.id}_ld`, orgId, entity: 'farmerGroup', entityId: g.id, name: `${f.firstName} ${f.lastName}`, role: m.role, phone: f.phone, gender: f.gender, createdAt: at });
    }
  }
  return out;
}

const COMMUNITY_DOCS: [string, string][] = [['membershipList', 'membershipList'], ['meetingRecords', 'meetingRecords'], ['contributionRecords', 'contributionRecords'], ['paymentRecords', 'paymentRecords'], ['partnershipAgreement', 'partnershipAgreement']];

export function seedDocuments(orgId: string, communities: Community[], groups: FarmerGroup[], pendingGroupId: string | undefined, uploadedBy: (c: Community) => string): RecordDocument[] {
  const out: RecordDocument[] = [];
  for (const c of communities) {
    for (const [field, type] of COMMUNITY_DOCS) {
      if (!c.customFields[field]) continue;
      out.push({ id: `${c.id}_doc_${type}`, orgId, entity: 'community', entityId: c.id, type, name: `${c.name} — ${type}.pdf`, mime: 'application/pdf', size: 120_000 + c.name.length * 3_100, uploadedBy: uploadedBy(c), uploadedAt: c.profiledAt });
    }
  }
  for (const g of groups.slice(0, 20)) {
    out.push({ id: `${g.id}_doc_meeting`, orgId, entity: 'farmerGroup', entityId: g.id, type: 'meetingRecords', name: `${g.name} — meeting minutes.pdf`, mime: 'application/pdf', size: 88_000, uploadedBy: g.createdBy, uploadedAt: g.createdAt });
  }
  const pending = groups.find((g) => g.id === pendingGroupId);
  if (pending) {
    // The newly uploaded meeting record awaiting a manual score (PRD 12.5).
    out.unshift({ id: `${pending.id}_doc_meeting_new`, orgId, entity: 'farmerGroup', entityId: pending.id, type: 'meetingRecords', name: `${pending.name} — meeting minutes (new).pdf`, mime: 'application/pdf', size: 142_000, uploadedBy: pending.createdBy, uploadedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
  }
  return out;
}

export function seedSavings(orgId: string, currency: string, groups: FarmerGroup[], memberships: GroupMembership[], now: Date): SavingsEntry[] {
  const out: SavingsEntry[] = [];
  const unit = currency === 'XOF' ? 1_000 : 1_000;
  for (const g of groups.filter((x) => x.type === 'VSLA')) {
    const members = memberships.filter((m) => m.groupId === g.id);
    for (let month = 5; month >= 0; month--) {
      const date = new Date(now.getFullYear(), now.getMonth() - month, 5).toISOString().slice(0, 10);
      members.forEach((m, i) => out.push({ id: `${g.id}_sv_${month}_${i}`, orgId, groupId: g.id, cycle: 1, date, kind: 'CONTRIBUTION', farmerId: m.farmerId, amount: { amountMinor: unit * (2 + (i % 3)), currency } }));
    }
    if (members[3]) {
      out.push({ id: `${g.id}_sv_loan`, orgId, groupId: g.id, cycle: 1, date: new Date(now.getFullYear(), now.getMonth() - 3, 12).toISOString().slice(0, 10), kind: 'LOAN', farmerId: members[3].farmerId, amount: { amountMinor: unit * 15, currency } });
      out.push({ id: `${g.id}_sv_rep`, orgId, groupId: g.id, cycle: 1, date: new Date(now.getFullYear(), now.getMonth() - 1, 12).toISOString().slice(0, 10), kind: 'REPAYMENT', farmerId: members[3].farmerId, amount: { amountMinor: unit * 8, currency } });
    }
  }
  return out;
}

/** Issues the company's rules raise on seeded records; farmers with open issues are flagged. */
export function seedIssues(orgId: string, settings: OrgSettings, farmers: Farmer[], communities: Community[], now: Date): QualityIssue[] {
  const flags = [
    ...checkEntity(settings.qualityRules, 'farmer', farmers as never, now).map((f) => ({ ...f, entity: 'farmer' as const })),
    ...checkEntity(settings.qualityRules, 'community', communities as never, now).map((f) => ({ ...f, entity: 'community' as const })),
  ];
  const created = new Map<string, string>([...farmers.map((f) => [f.id, f.registeredAt] as const), ...communities.map((c) => [c.id, c.profiledAt] as const)]);
  const agentOf = new Map<string, string>([...farmers.map((f) => [f.id, f.agentId] as const), ...communities.map((c) => [c.id, c.agentIds[0] ?? ''] as const)]);
  const issues = flags.map((f, i): QualityIssue => ({
    id: `${orgId}_qi_${i + 1}`, orgId, entity: f.entity, recordId: f.recordId, ruleId: f.ruleId, severity: f.severity, params: f.params,
    status: 'OPEN', agentId: agentOf.get(f.recordId) || undefined, source: 'SEED', createdAt: created.get(f.recordId) ?? now.toISOString(), updatedAt: created.get(f.recordId) ?? now.toISOString(),
  }));
  const flagged = new Set(issues.filter((i) => i.entity === 'farmer').map((i) => i.recordId));
  for (const f of farmers) f.qualityStatus = flagged.has(f.id) ? 'FLAGGED' : 'OK';
  return issues;
}

/** Group scorecards: past manual reviews plus the automatic criteria, so stored scores match their breakdown. */
export function scoreGroups(groups: FarmerGroup[], memberships: GroupMembership[], farmers: Farmer[], purchases: Purchase[], reviewedAt: string) {
  groups.forEach((g, i) => {
    const pending = g.scoreStatus === 'PENDING_REVIEW';
    g.customFields.manualScores = {
      meetingMinutes: pending ? null : 1 + (i % 4),
      contributionRecords: 6 + ((i * 5) % 13),
      reviewedBy: g.createdBy,
      reviewedAt,
    };
    g.score = groupScore(g, { memberships, farmers, purchases }).total;
  });
}
