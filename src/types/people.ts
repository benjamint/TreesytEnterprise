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

/** People with a role in a community or farmer group (PRD C2 Leaders, C4 Leaders). */
export interface Leader {
  id: string;
  orgId: string;
  entity: 'community' | 'farmerGroup';
  entityId: string;
  name: string;
  role: string;
  phone: string;
  gender?: 'F' | 'M';
  createdAt: string;
}

/** Files attached to a record (membership lists, meeting records, agreements…). */
export interface RecordDocument {
  id: string;
  orgId: string;
  entity: 'community' | 'farmerGroup' | 'farmer';
  entityId: string;
  type: string;
  name: string;
  mime: string;
  size: number;
  /** Small images and PDFs are kept as data URLs in the prototype. */
  dataUrl?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export type QualityEntity = 'farmer' | 'community' | 'farmerGroup';

/** A data-quality flag raised by a rule (PRD C5). */
export interface QualityIssue {
  id: string;
  orgId: string;
  entity: QualityEntity;
  recordId: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'block';
  params: Record<string, unknown>;
  status: 'OPEN' | 'ASSIGNED' | 'VALID' | 'RESOLVED';
  agentId?: string;
  taskId?: string;
  note?: string;
  source: 'SEED' | 'IMPORT' | 'WEB' | 'MOBILE' | 'RECHECK';
  createdAt: string;
  updatedAt: string;
  resolvedBy?: string;
}

/** A job sent to an agent's phone (fix a record, revisit a farmer…). */
export interface FieldTask {
  id: string;
  orgId: string;
  agentId: string;
  userId: string;
  kind: 'qualityFix' | 'surveyFix';
  /** For survey fixes the record is the response. */
  entity: QualityEntity | 'response';
  recordId: string;
  issueIds: string[];
  fields: string[];
  note?: string;
  status: 'OPEN' | 'DONE';
  createdAt: string;
  createdBy: string;
  doneAt?: string;
}

export type ImportType = 'communities' | 'farmers' | 'groups' | 'members' | 'leaders' | 'recoveries' | 'warehouseLoads' | 'priceLists' | 'locations' | 'users' | 'agents';

export interface ImportRun {
  id: string;
  orgId: string;
  type: ImportType;
  fileName: string;
  by: string;
  at: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  createdIds: string[];
  status: 'DONE' | 'UNDONE';
}

/** VSLA savings ledger entries (PRD C4 savings group sub-module). */
export interface SavingsEntry {
  id: string;
  orgId: string;
  groupId: string;
  cycle: number;
  date: string;
  kind: 'CONTRIBUTION' | 'LOAN' | 'REPAYMENT' | 'SHAREOUT';
  farmerId?: string;
  amount: Money;
  note?: string;
}
