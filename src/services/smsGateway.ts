import type { OutboxMessage } from '@/types';
import { uid } from '@/lib/utils';
import { useNotificationStore } from '@/stores/notificationStore';

/** Simulated SMS (PRD 4.4): written to the outbox. */
export function sendSms(m: { orgId: string; to: string; templateId: string; language: string; body: string }): OutboxMessage {
  const msg: OutboxMessage = { id: uid('out'), orgId: m.orgId, channel: 'SMS', recipient: m.to, templateId: m.templateId, language: m.language, body: m.body, status: 'DELIVERED', at: new Date().toISOString() };
  useNotificationStore.getState().send(msg);
  return msg;
}
