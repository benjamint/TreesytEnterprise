import type { GPS, OrgEntity, Money } from './core';

export interface LocationNode {
  id: string;
  orgId: string;
  levelId: string;
  parentId: string | null;
  name: string;
  code: string;
  center?: { lat: number; lng: number };
}

export interface Community extends OrgEntity {
  code: string;
  name: string;
  locationNodeId: string;
  population: number;
  agentIds: string[];
  gps: GPS;
  contactPerson: { name: string; phone: string };
  profiledAt: string;
  score: number;
  flags: string[];
  customFields: Record<string, unknown>;
}

export interface FarmerIdentity {
  photo: boolean;
  idCard: boolean;
  thumbprints: { left: boolean; right: boolean };
  consent: { type: 'AUDIO' | 'SIGNATURE' | 'TICK'; capturedAt: string } | null;
  nfcCard: { number: string; status: 'ISSUED' | 'REPLACED' | 'REVOKED' } | null;
}

export interface Farmer extends OrgEntity {
  farmerCode: string;
  firstName: string;
  lastName: string;
  gender: 'F' | 'M';
  dateOfBirth: string;
  phone: string;
  communityId: string;
  locationNodeId: string;
  registeredAt: string;
  agentId: string;
  primaryCrop: string;
  identity: FarmerIdentity;
  qualityStatus: 'OK' | 'FLAGGED';
  score: number;
  version: number;
  customFields: Record<string, unknown>;
}

export interface GroupMembership {
  id: string;
  orgId: string;
  groupId: string;
  farmerId: string;
  role: 'MEMBER' | 'LEADER' | 'SECRETARY' | 'TREASURER';
  joinedAt: string;
  leftAt?: string;
}

export interface FarmerGroup extends OrgEntity {
  name: string;
  type: 'COOPERATIVE' | 'VSLA' | 'WOMENS_GROUP' | 'PRODUCER_GROUP';
  communityId: string;
  established: string;
  paymentOption: 'MOMO' | 'BANK' | 'CASH';
  wallet?: { provider: string; number: string; name: string };
  score: number;
  scoreStatus: 'PENDING_REVIEW' | 'COMPLETED';
  customFields: Record<string, unknown>;
}

export interface Agent extends OrgEntity {
  userId: string;
  agentTypeId: string;
  areaNodeIds: string[];
  managerIds: string[];
  warehouseId?: string;
  wallet: { providerId: string; number: string; verifiedName: string };
  status: 'INVITED' | 'ACTIVE' | 'DEACTIVATED';
  lastSyncAt: string;
  appVersion: string;
  weekTargetPct: number;
  score: number;
  flags: string[];
}

export interface Warehouse extends OrgEntity {
  name: string;
  type: 'COMMUNITY_STORE' | 'AGGREGATION_HUB' | 'CENTRAL' | 'PORT';
  locationNodeId: string;
  officerUserIds: string[];
  capacityKg: number;
  status: 'ACTIVE' | 'INACTIVE';
  gps: GPS;
}

export interface LoanAccount extends OrgEntity {
  farmerId: string;
  principal: Money;
  disbursedAt: string;
  window: { start: string; end: string };
  repayments: { date: string; amount: Money; mode: 'CASH' | 'PRODUCE' }[];
  status: 'ACTIVE' | 'SETTLED';
}
