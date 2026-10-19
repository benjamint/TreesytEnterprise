import type { Farmer } from '@/types';
import type { FormSchema } from '@/engines/forms';
import { withCalculated } from '@/engines/forms';
import { ancestorAtLevel } from '@/engines/locations';
import { initialsOf } from '@/engines/numbering';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLocationStore } from '@/stores/locationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { recheck } from './qualityService';

export interface FarmerCore {
  firstName: string;
  lastName: string;
  gender: Farmer['gender'];
  dateOfBirth: string;
  phone: string;
  communityId: string;
  primaryCrop?: string;
}

/**
 * Register a farmer from the phone or a synced outbox item: ID from the company pattern,
 * answers from the live farmer profile form (with the version they were captured on),
 * data-quality rules run on save.
 */
export function registerFarmer(orgId: string, actorId: string, core: FarmerCore, form: FormSchema, answers: Record<string, unknown>, opts: { agentId?: string; device?: 'mobile' | 'web' } = {}): { farmer: Farmer; flags: number } {
  const settings = useSettingsStore.getState().settings[orgId]!;
  const community = useCommunityStore.getState().communities.find((c) => c.id === core.communityId)!;
  const region = ancestorAtLevel(useLocationStore.getState().nodes, community.locationNodeId, settings.locationLevels[0]!.id);
  const name = `${core.firstName.trim()} ${core.lastName.trim()}`;
  const code = useSettingsStore.getState().issueNumber(orgId, 'farmerId', { community: community.code, initials: initialsOf(name), region: region?.code ?? '', date: new Date() });
  const now = new Date().toISOString();
  const custom = withCalculated(form, answers);
  const farmer: Farmer = {
    id: uid('far'), orgId, createdAt: now, updatedAt: now, createdBy: actorId, farmerCode: code, firstName: core.firstName.trim(), lastName: core.lastName.trim(),
    gender: core.gender, dateOfBirth: core.dateOfBirth, phone: core.phone, communityId: community.id, locationNodeId: community.locationNodeId, registeredAt: now,
    agentId: opts.agentId ?? community.agentIds[0] ?? '', primaryCrop: core.primaryCrop ?? settings.commodities[0]?.id ?? '',
    identity: { photo: false, idCard: false, thumbprints: { left: false, right: false }, consent: null, nfcCard: null },
    qualityStatus: 'OK', score: 0, version: 1, formVersion: form.version, customFields: custom,
  };
  useFarmerStore.getState().saveFarmer(farmer);
  useActivityStore.getState().log(makeEvent(orgId, 'farmer', farmer.id, 'farmer.registered', { name, code }, actorId, { device: opts.device ?? 'mobile' }));
  const flags = recheck(orgId, 'farmer', [farmer.id], opts.device === 'web' ? 'WEB' : 'MOBILE', actorId).length;
  return { farmer, flags };
}
