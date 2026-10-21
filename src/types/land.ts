import type { GPS, Money, OrgEntity } from './core';

/** Nurseries, seedlings, trees, plots, EUDR and carbon projects (PRD I1–I6). */

export interface LandImage { id: string; kind: 'PROFILING' | 'PRIMARY' | 'SECONDARY' | 'PLOT' | 'AGREEMENT' | 'VISIT'; name: string; at: string; by: string }

// ---------------------------------------------------------------- Nurseries (I1)

export interface NurseryBatch {
  id: string;
  number: string;
  speciesId: string;
  sownAt: string;
  /** Poly bags filled. */
  quantity: number;
  potted: number;
  germinated: number;
  alive: number;
  /** Seedlings handed out to farmers or agents. */
  disbursed: number;
  /** After each monitoring round. */
  history: { roundId: string; at: string; germinated: number; alive: number }[];
}

export interface NurseryRoundValues { batchId: string; polyBags?: number; potted?: number; germinated?: number; alive?: number; dead?: number; newGerminations?: number }

/** One scheduled monitoring visit (company rounds: Primary, Secondary 1…N). */
export interface NurseryRound {
  id: string;
  defId: string;
  /** Secondary rounds are numbered 1…N. */
  seq: number;
  kind: 'PRIMARY' | 'SECONDARY';
  dueDate: string;
  doneAt?: string;
  by?: string;
  device?: 'web' | 'mobile';
  values: NurseryRoundValues[];
  photos: string[];
  notes?: string;
}

export interface Nursery extends OrgEntity {
  code: string;
  name: string;
  communityId: string;
  agentId?: string;
  gps: GPS;
  fenced: boolean;
  waterSource: string;
  material: string;
  representative: { name: string; gender: 'M' | 'F'; phone: string };
  /** Answers to the company's nursery profile form. */
  profile: Record<string, unknown>;
  batches: NurseryBatch[];
  rounds: NurseryRound[];
  images: LandImage[];
  agreement?: { name: string; at: string; by: string };
  status: 'ACTIVE' | 'CLOSED';
  device?: 'web' | 'mobile';
}

// ---------------------------------------------------------------- Seedlings (I2)

/** Seedlings coming in: from a nursery batch or an external supplier, with their codes. */
export interface SeedlingLot extends OrgEntity {
  number: string;
  source: 'NURSERY' | 'EXTERNAL';
  nurseryId?: string;
  batchId?: string;
  supplierName?: string;
  speciesId: string;
  quantity: number;
  receivedAt: string;
  cost?: Money;
  /** First and last code issued (codes are consecutive). */
  codeFrom: string;
  codeTo: string;
  codes: string[];
}

export type AllocationKind = 'TO_AGENT' | 'TO_FARMER' | 'TO_COMPANY';

export interface SeedlingAllocation extends OrgEntity {
  kind: AllocationKind;
  speciesId: string;
  quantity: number;
  codes: string[];
  lotId?: string;
  nurseryId?: string;
  batchId?: string;
  agentId?: string;
  farmerId?: string;
  communityId?: string;
  plotId?: string;
  /** Transfer to another company needs its consent. */
  toOrgId?: string;
  consent?: { status: 'PENDING' | 'ACCEPTED' | 'DECLINED'; at?: string; by?: string };
  device?: 'web' | 'mobile';
}

// ---------------------------------------------------------------- Trees (I3)

export type TreeState = 'ALIVE' | 'DEAD' | 'NOT_FOUND';

export interface TreeVisit {
  id: string;
  at: string;
  by: string;
  round: number;
  state: TreeState;
  heightM?: number;
  health?: number;
  issues: string[];
  causeOfDeath?: string;
  answers: Record<string, unknown>;
  photos: string[];
  gps?: GPS;
  device: 'web' | 'mobile';
}

export interface Tree extends OrgEntity {
  code: string;
  speciesId: string;
  farmerId: string;
  communityId: string;
  plotId?: string;
  allocationId?: string;
  projectId?: string;
  plantedAt: string;
  gps: GPS;
  state: TreeState;
  heightM?: number;
  /** 0–100 from the species form. */
  health?: number;
  issues: string[];
  /** Monitoring round of the last visit. */
  round: number;
  lastVisitAt?: string;
  visits: TreeVisit[];
}

// ---------------------------------------------------------------- Plots (I4)

export type DeforestationResult = 'CLEAR' | 'RISK' | 'NOT_CHECKED';

export interface PlotValidation {
  closed: boolean;
  selfIntersects: boolean;
  /** Fewest decimal places in any coordinate. */
  decimals: number;
  precisionOk: boolean;
  /** Over the polygon threshold (4 ha) but recorded as a point. */
  needsPolygon: boolean;
  overlaps: string[];
  ok: boolean;
}

export interface PlotVisit {
  id: string;
  at: string;
  by: string;
  answers: Record<string, boolean | string>;
  photos: string[];
  device: 'web' | 'mobile';
}

export interface Plot extends OrgEntity {
  code?: string;
  typeId?: string;
  farmerId: string;
  communityId: string;
  geometry?: 'POINT' | 'POLYGON';
  /** Ring of [lat, lng] (first point not repeated). Empty for a point. */
  polygon: [number, number][];
  point?: [number, number];
  /** Calculated from the geometry. */
  areaHa: number;
  declaredAreaHa?: number;
  gpsAccuracyM?: number;
  /** Simplified status shown to buyers: from the deforestation check. */
  eudrStatus: 'COMPLIANT' | 'AT_RISK' | 'PENDING';
  check?: { result: DeforestationResult; at?: string; by?: string; lossHa?: number; zoneId?: string };
  validation?: PlotValidation;
  crop: string;
  agreement?: { name: string; at: string; by: string };
  images?: LandImage[];
  visits?: PlotVisit[];
  agentId?: string;
  device?: 'web' | 'mobile';
  source?: 'MAPPED' | 'DRAWN' | 'IMPORTED';
}

// ---------------------------------------------------------------- EUDR (I5)

/** Bundled forest-loss layer (simulated): areas cleared after the cut-off date. */
export interface ForestLossZone { id: string; orgId: string; name: string; polygon: [number, number][]; lossYear: number }

/** A lot: purchases → bags → dispatch, with the plots it came from. */
export interface EudrLot extends OrgEntity {
  number: string;
  commodityId: string;
  dispatchId?: string;
  purchaseIds: string[];
  bagCodes: string[];
  plotIds: string[];
  kg: number;
}

export interface DueDiligenceStatement extends OrgEntity {
  number: string;
  dispatchId?: string;
  lotId?: string;
  commodityId: string;
  hsCode: string;
  kg: number;
  country: string;
  operator: { name: string; eori: string; address: string };
  plotIds: string[];
  /** Plots with a Risk result at generation time. */
  riskPlotIds: string[];
  risk: 'NEGLIGIBLE' | 'NON_NEGLIGIBLE';
  status: 'DRAFT' | 'SUBMITTED';
  reference?: string;
  submittedAt?: string;
  submittedBy?: string;
}

// ---------------------------------------------------------------- Carbon (I6)

export type CarbonStandard = 'VERRA' | 'GOLD_STANDARD' | 'PLAN_VIVO' | 'INTERNAL';

export interface CarbonProject extends OrgEntity {
  number: string;
  name: string;
  standard: CarbonStandard;
  startDate: string;
  /** Baseline emissions or stock, tCO₂e. */
  baselineT: number;
  speciesTargets: { speciesId: string; target: number }[];
  communityIds: string[];
  plotIds: string[];
  monitoringPlan: string;
  partner?: { orgId?: string; name: string };
  /** kg CO₂ per tree per year, editable per species for this project. */
  co2Factors: Record<string, number>;
  status: 'ACTIVE' | 'CLOSED';
}
