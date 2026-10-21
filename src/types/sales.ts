import type { ApprovalRecord, Money, OrgEntity, WorkflowState } from './core';

/** Clients, sales contracts, dispatch orders and the buyer portal (PRD H6–H8). */

/** A buyer the company sells to. Linked to a platform company when the buyer uses Traceboard. */
export interface Client extends OrgEntity {
  name: string;
  /** Short code used in sale numbers (SN-{clientCode}-…). */
  code: string;
  country: string;
  buyerOrgId?: string;
  contactName?: string;
  email?: string;
}

export interface QualitySpec { key: string; label: string; max?: number; min?: number; unit: string }

export interface PaymentInstalment {
  id: string;
  label: string;
  pct: number;
  amount: Money;
  /** Due date; instalments due on delivery get one when the first delivery is verified. */
  dueDate?: string;
  trigger: 'SIGNATURE' | 'DELIVERY' | 'AFTER_DELIVERY';
  received?: { at: string; by: string; reference?: string };
}

export type ContractStatus = 'DRAFT' | 'AGREED' | 'ORDER_CREATED' | 'FULFILLED' | 'CANCELLED';

export interface SalesContract extends OrgEntity {
  number: string;
  clientId: string;
  templateId?: string;
  commodityId: string;
  grade?: string;
  /** Contracted quantity in the contract unit (e.g. t). */
  quantity: number;
  unitId: string;
  pricePerUnit: Money;
  qualitySpec: QualitySpec[];
  paymentTermId: string;
  packagingId: string;
  shipmentWindow: { start: string; end: string };
  deliveryPoint: string;
  officerUserId: string;
  /** Delivered weight within this percentage of the contract counts as fulfilled. */
  tolerancePct: number;
  status: ContractStatus;
  signedDocument?: string;
  schedule: PaymentInstalment[];
  documents: SalesDocument[];
  notes?: string;
}

export interface SalesDocument { id: string; type: string; name: string; at: string; by: string }

export type DispatchStatus = 'PENDING_APPROVAL' | 'REJECTED' | 'ON_HOLD' | 'PENDING' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED' | 'VERIFIED';

/** What the buyer sees about the farmers behind an order (company-configurable KPIs). */
export interface ImpactSnapshot {
  farmers: number;
  communities: number;
  womenPct: number;
  childrenPerFarmer: number;
  treesPlanted: number;
  plotsMapped: number;
  eudrPct: number;
}

export interface DispatchOrder extends OrgEntity {
  number: string;
  kind: 'INVENTORY' | 'DIRECT';
  clientId: string;
  contractId?: string;
  commodityId: string;
  /** Inventory: the outbounds loaded on the truck. Direct: the purchase requests bought for this buyer. */
  outboundIds: string[];
  requestIds: string[];
  bagCodes: string[];
  loading: { warehouseId?: string; place: string };
  driver: { name: string; phone: string; licence?: string };
  truck: { plate: string; image?: string };
  waybill: string;
  expectedKg: number;
  impact: ImpactSnapshot;
  status: DispatchStatus;
  wf?: WorkflowState;
  approvals: ApprovalRecord[];
  /** Shipment tracking: each status change and position update. */
  tracking: { at: string; status: DispatchStatus; lat?: number; lng?: number; eta?: string; note?: string; by: string }[];
  position?: { lat: number; lng: number; at: string; eta?: string };
  verification?: {
    weighbridge: string; invoice: string; qualityTest?: string; deliveredKg: number; bagsDelivered: number;
    unitPrice: Money; amount: Money; saleNumber: string; at: string; by: string;
  };
  documents: SalesDocument[];
  /** Who downloaded which document, from which company. */
  downloads: { docId: string; userId: string; orgId: string; at: string }[];
}

export interface InsightRequest {
  id: string;
  /** The buyer asking. */
  fromOrgId: string;
  /** The supplier asked. */
  orgId: string;
  userId: string;
  topic: string;
  message: string;
  dispatchId?: string;
  status: 'OPEN' | 'ANSWERED';
  createdAt: string;
  answer?: { text: string; by: string; at: string };
}

/** A mapped plot (built out in Phase 14); here for trace to source. */
export interface Plot extends OrgEntity {
  farmerId: string;
  communityId: string;
  polygon: [number, number][];
  areaHa: number;
  eudrStatus: 'COMPLIANT' | 'AT_RISK' | 'PENDING';
  crop: string;
}
