import type { OutboxMessage } from '@/types';
import { uid } from '@/lib/utils';
import { useNotificationStore } from '@/stores/notificationStore';

/** Simulated email (PRD 4.4): every message lands in the Notifications outbox instead of being sent. */
export function sendEmail(m: { orgId: string; to: string; templateId: string; language: string; subject: string; body: string }): OutboxMessage {
  const msg: OutboxMessage = { id: uid('out'), orgId: m.orgId, channel: 'EMAIL', recipient: m.to, templateId: m.templateId, language: m.language, subject: m.subject, body: m.body, status: 'DELIVERED', at: new Date().toISOString() };
  useNotificationStore.getState().send(msg);
  return msg;
}
