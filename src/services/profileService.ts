import type { Community, Farmer, FarmerGroup, FarmerIdentity, Leader, RecordDocument } from '@/types';
import type { FormSchema } from '@/engines/forms';
import { withCalculated } from '@/engines/forms';
import { ancestorAtLevel } from '@/engines/locations';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLocationStore } from '@/stores/locationStore';
import { useRecordsStore } from '@/stores/recordsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { recheck } from './qualityService';

/**
 * Saves for community profiling (M3) and farmer groups / farmer edits (M4) captured on the phone.
 * Same rules as the web forms: codes from the company patterns, one group per name in a community,
 * data-quality rules on save, structured activity.
 */

const now = () => new Date().toISOString();
const log = (orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string) =>
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device: 'mobile' }));

export interface LeaderInput { name: string; role: string; phone: string }

function addPhotos(orgId: string, entity: RecordDocument['entity'], entityId: string, photos: string[], type: string, actorId: string) {
  photos.forEach((p, i) => useRecordsStore.getState().addDocument({
    id: uid('doc'), orgId, entity, entityId, type, name: `${type}-${i + 1}.jpg`, mime: 'image/jpeg', size: 180_000 + i * 12_000,
    dataUrl: p.startsWith('data:') ? p : undefined, uploadedBy: actorId, uploadedAt: now(),
  }));
}
function addLeaders(orgId: string, entity: Leader['entity'], entityId: string, leaders: LeaderInput[]) {
  for (const l of leaders.filter((x) => x.name.trim())) useRecordsStore.getState().saveLeader({ id: uid('ld'), orgId, entity, entityId, name: l.name.trim(), role: l.role, phone: l.phone, createdAt: now() });
}

export interface CommunityPayload {
  id?: string; name: string; parentNodeId: string; gps: { lat: number; lng: number; accuracy: number }; population: number;
  contact: { name: string; phone: string }; agentIds: string[]; answers: Record<string, unknown>;
  leaders: LeaderInput[]; groups: { name: string; type: FarmerGroup['type'] }[]; photos: string[];
}

export function saveCommunity(orgId: string, actorId: string, p: CommunityPayload, form: FormSchema): Community {
  const settings = useSettingsStore.getState().settings[orgId]!;
  const nodes = useLocationStore.getState().nodes.filter((n) => n.orgId === orgId);
  const leafLevel = settings.locationLevels[settings.locationLevels.length - 1]!.id;
  const existing = p.id ? useCommunityStore.getState().communities.find((c) => c.id === p.id) : undefined;
  let nodeId = existing?.locationNodeId;
  const leaf = nodes.find((n) => n.id === nodeId);
  if (!existing || leaf?.parentId !== p.parentNodeId || leaf?.name !== p.name.trim()) {
    const same = nodes.find((n) => n.parentId === p.parentNodeId && n.levelId === leafLevel && n.name.toLowerCase() === p.name.trim().toLowerCase());
    if (same) nodeId = same.id;
    else {
      const node = { id: uid('loc'), orgId, levelId: leafLevel, parentId: p.parentNodeId, name: p.name.trim(), code: p.name.trim().slice(0, 3).toUpperCase(), center: { lat: p.gps.lat, lng: p.gps.lng } };
      useLocationStore.getState().setOrgNodes(orgId, [...nodes, node]);
      nodeId = node.id;
    }
  }
  const region = ancestorAtLevel(useLocationStore.getState().nodes, nodeId!, settings.locationLevels[0]!.id);
  const code = existing?.code ?? useSettingsStore.getState().issueNumber(orgId, 'communityCode', { region: region?.code ?? '', date: new Date() });
  const at = now();
  const c: Community = {
    ...(existing ?? { id: uid('com'), createdAt: at, createdBy: actorId, profiledAt: at, score: 0, flags: [] }),
    orgId, updatedAt: at, code, name: p.name.trim(), locationNodeId: nodeId!, population: p.population, agentIds: p.agentIds, gps: p.gps,
    contactPerson: p.contact, customFields: withCalculated(form, p.answers),
  } as Community;
  useCommunityStore.getState().saveCommunity(c);
  log(orgId, 'community', c.id, existing ? 'community.updated' : 'community.created', { name: c.name, code }, actorId);
  addLeaders(orgId, 'community', c.id, p.leaders);
  for (const g of p.groups.filter((x) => x.name.trim())) saveGroup(orgId, actorId, { name: g.name, type: g.type, communityId: c.id, established: at.slice(0, 10), paymentOption: 'CASH', answers: {}, memberIds: [], leaders: [], photos: [] });
  addPhotos(orgId, 'community', c.id, p.photos, 'photo', actorId);
  recheck(orgId, 'community', [c.id], 'MOBILE', actorId);
  return c;
}

export interface GroupPayload {
  id?: string; name: string; type: FarmerGroup['type']; communityId: string; established: string; paymentOption: FarmerGroup['paymentOption'];
  wallet?: FarmerGroup['wallet']; answers: Record<string, unknown>; memberIds: string[]; leaders: LeaderInput[]; photos: string[]; docType?: string;
}

/** Upsert by name within the community, add new members, leaders and record documents. */
export function saveGroup(orgId: string, actorId: string, p: GroupPayload): FarmerGroup {
  const groups = useGroupStore.getState().groups;
  const existing = (p.id ? groups.find((g) => g.id === p.id) : undefined)
    ?? groups.find((g) => g.orgId === orgId && g.communityId === p.communityId && g.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  const at = now();
  const g: FarmerGroup = {
    ...(existing ?? { id: uid('grp'), createdAt: at, createdBy: actorId, score: 0, scoreStatus: 'PENDING_REVIEW' as const }),
    orgId, updatedAt: at, name: p.name.trim(), type: p.type, communityId: p.communityId, established: p.established, paymentOption: p.paymentOption,
    wallet: p.wallet, customFields: { ...(existing?.customFields ?? {}), ...p.answers },
  } as FarmerGroup;
  useGroupStore.getState().saveGroup(g);
  log(orgId, 'farmerGroup', g.id, existing ? 'group.updated' : 'group.created', { name: g.name }, actorId);
  const current = new Set(useGroupStore.getState().groupMemberships.filter((m) => m.groupId === g.id && !m.leftAt).map((m) => m.farmerId));
  const added = p.memberIds.filter((id) => !current.has(id));
  for (const id of added) useGroupStore.getState().addMembership({ id: uid('gm'), orgId, groupId: g.id, farmerId: id, role: 'MEMBER', joinedAt: at.slice(0, 10) });
  if (added.length) log(orgId, 'farmerGroup', g.id, 'group.membersAdded', { count: added.length }, actorId);
  addLeaders(orgId, 'farmerGroup', g.id, p.leaders);
  addPhotos(orgId, 'farmerGroup', g.id, p.photos, p.docType ?? 'meetingRecords', actorId);
  // A new meeting or contribution record resets the manual part of the score for review (as on the web).
  if (p.photos.length && p.docType && ['meetingRecords', 'contributionRecords'].includes(p.docType)) {
    useGroupStore.getState().saveGroup({ ...g, scoreStatus: 'PENDING_REVIEW' });
    log(orgId, 'farmerGroup', g.id, 'group.reviewNeeded', { doc: p.docType }, actorId);
  }
  return g;
}

export interface FarmerEditPayload { id: string; patch: Partial<Pick<Farmer, 'firstName' | 'lastName' | 'phone' | 'gender' | 'dateOfBirth' | 'communityId'>>; answers?: Record<string, unknown> }

/** A new profile version from the phone (the web keeps the history). */
export function saveFarmerEdit(orgId: string, actorId: string, p: FarmerEditPayload): Farmer | undefined {
  const f = useFarmerStore.getState().farmers.find((x) => x.id === p.id);
  if (!f) return undefined;
  const fields = Object.keys(p.patch).filter((k) => (p.patch as Record<string, unknown>)[k] !== (f as unknown as Record<string, unknown>)[k]);
  const next: Farmer = { ...f, ...p.patch, customFields: { ...f.customFields, ...(p.answers ?? {}) }, version: f.version + 1, updatedAt: now() };
  useFarmerStore.getState().saveFarmer(next);
  log(orgId, 'farmer', f.id, 'farmer.updated', { version: next.version, fields: fields.join(', ') || '—' }, actorId);
  recheck(orgId, 'farmer', [f.id], 'MOBILE', actorId);
  return next;
}

/** Identity captured during registration (photo, ID card, thumbprints, consent, NFC card). */
export function saveIdentity(farmerId: string, identity: Partial<FarmerIdentity>, actorId: string) {
  const f = useFarmerStore.getState().farmers.find((x) => x.id === farmerId);
  if (!f) return;
  useFarmerStore.getState().saveFarmer({ ...f, identity: { ...f.identity, ...identity } });
  if (identity.consent) log(f.orgId, 'farmer', f.id, 'farmer.consentRecorded', {}, actorId);
  if (identity.nfcCard) log(f.orgId, 'farmer', f.id, 'farmer.cardIssued', { number: identity.nfcCard.number }, actorId);
}
