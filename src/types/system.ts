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
}
