import type { OutboxMessage } from '@/types';
import { uid } from '@/lib/utils';
import { useNotificationStore } from '@/stores/notificationStore';

/** Simulated push (PRD 4.4): written to the outbox. */
export function sendPush(m: { orgId: string; to: string; templateId: string; language: string; subject: string; body: string }): OutboxMessage {
  const msg: OutboxMessage = { id: uid('out'), orgId: m.orgId, channel: 'PUSH', recipient: m.to, templateId: m.templateId, language: m.language, subject: m.subject, body: m.body, status: 'SENT', at: new Date().toISOString() };
  useNotificationStore.getState().send(msg);
  return msg;
}
