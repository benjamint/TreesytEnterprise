import type { Community, DataSharingGrant, Farmer } from '@/types';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { usePlatformStore } from '@/stores/platformStore';

/** Records other companies share with this one (PRD A5): read-only, labelled with the owner. */
export interface Shared<T> { row: T; fromOrgId: string; grantId: string }

const grantsTo = (orgId: string, scope: DataSharingGrant['scopes'][number], grants = usePlatformStore.getState().grants) =>
  grants.filter((g) => g.toOrgId === orgId && g.status === 'ACTIVE' && g.scopes.includes(scope));

const covers = (g: DataSharingGrant, communityId: string) => !g.communityIds?.length || g.communityIds.includes(communityId);

export function sharedCommunities(orgId: string, communities: Community[] = useCommunityStore.getState().communities, grants?: DataSharingGrant[]): Shared<Community>[] {
  return grantsTo(orgId, 'communities', grants).flatMap((g) => communities.filter((c) => c.orgId === g.fromOrgId && covers(g, c.id)).map((row) => ({ row, fromOrgId: g.fromOrgId, grantId: g.id })));
}

export function sharedFarmers(orgId: string, farmers: Farmer[] = useFarmerStore.getState().farmers, grants?: DataSharingGrant[]): Shared<Farmer>[] {
  return grantsTo(orgId, 'farmers', grants).flatMap((g) => farmers.filter((f) => f.orgId === g.fromOrgId && covers(g, f.communityId)).map((row) => ({ row, fromOrgId: g.fromOrgId, grantId: g.id })));
}
