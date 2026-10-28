export interface AppNotification {
  id: string;
  orgId: string;
  userId: string;
  kind: 'APPROVAL' | 'PAYMENT' | 'SYNC' | 'ALERT';
  key: string;
  params: Record<string, unknown>;
  link?: string;
  read: boolean;
  at: string;
}

export interface OutboxMessage {
  id: string;
  orgId: string;
  channel: 'EMAIL' | 'SMS' | 'PUSH';
  recipient: string;
  templateId: string;
  language: string;
  subject?: string;
  body: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  at: string;
  failureReason?: string;
  /** The person it was for, when they are a user. */
  userId?: string;
}

export interface AuditEntry {
  id: string;
  orgId: string;
  actorId: string;
  entity: string;
  entityId: string;
  key: string;
  before?: unknown;
  after?: unknown;
  at: string;
  ip?: string;
  device?: string;
  gps?: { lat: number; lng: number };
}

// ---------------------------------------------------------------- Phase 17: system (PRD K1–K8)

export type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

/** One sync of one type from a phone (PRD K3). */
export interface SyncLog {
  id: string;
  orgId: string;
  userId: string;
  deviceId?: string;
  appVersion: string;
  type: string;
  sent: number;
  created: number;
  updated: number;
  failed: number;
  status: SyncStatus;
  ms: number;
  at: string;
  request: unknown;
  response: unknown;
  error?: string;
  errorCode?: SyncErrorCode;
  /** Request / response bodies removed by the payload retention rule. */
  payloadPurged?: boolean;
}

export type SyncErrorCode = 'DUPLICATE' | 'VALIDATION' | 'CONFLICT' | 'TIMEOUT' | 'VERSION' | 'AUTH';

export interface Device {
  id: string;
  orgId: string;
  userId: string;
  model: string;
  os: 'ANDROID' | 'IOS';
  osVersion: string;
  appVersion: string;
  push: 'ACTIVE' | 'EXPIRED' | 'NONE';
  lastSeenAt: string;
  status: 'ACTIVE' | 'SIGNED_OUT';
  updateRequired?: boolean;
  signedOutAt?: string;
}

export type ReportChart = 'TABLE' | 'BAR' | 'LINE' | 'DONUT';
export interface ReportFilter { column: string; op: 'equals' | 'contains' | 'gt' | 'lt' | 'between'; value: string; value2?: string }

export interface SavedReport {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  entity: string;
  columns: string[];
  filters: ReportFilter[];
  groupBy?: string;
  /** Column summed per group (count when empty). */
  measure?: string;
  chart: ReportChart;
  /** Library reports reproduce today's exports (named in the viewer's language); they can be copied, not deleted. */
  libraryKey?: string;
  schedule?: { frequency: 'DAILY' | 'WEEKLY'; weekday?: number; time: string; roleIds: string[]; lastSentAt?: string };
  sharedWithRoleIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportJob {
  id: string;
  orgId: string;
  userId: string;
  reportId?: string;
  name: string;
  format: 'CSV' | 'XLSX';
  rows: number;
  progress: number;
  status: 'RUNNING' | 'READY' | 'EXPIRED';
  createdAt: string;
  readyAt?: string;
  expiresAt?: string;
}

export interface JobRun {
  id: string;
  orgId?: string;
  key: string;
  startedAt: string;
  ms: number;
  status: 'SUCCESS' | 'FAILED';
  by: string;
  log: string[];
}

export interface KbArticle {
  id: string;
  /** Empty for global articles shared by every company. */
  orgId?: string;
  slug: string;
  title: Partial<Record<'en' | 'fr', string>>;
  body: Partial<Record<'en' | 'fr', string>>;
  category: string;
  tags: string[];
  updatedAt: string;
  updatedBy: string;
}
