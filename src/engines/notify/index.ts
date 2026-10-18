/** Notification rules (PRD 8.15). Emitting an event resolves recipients and channels. */
export type Channel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

export interface NotificationRule {
  id: string;
  eventKey: string;
  channels: Channel[];
  recipients: { kind: 'roles'; roleIds: string[] } | { kind: 'owner' } | { kind: 'users'; userIds: string[] } | { kind: 'buyerAdmins' };
  templateId: string;
  enabled: boolean;
}

export interface Delivery {
  ruleId: string;
  userId: string;
  channel: Channel;
  templateId: string;
}

export interface RecipientDirectory {
  usersWithRole: (roleId: string) => string[];
  buyerAdmins: () => string[];
}

export function resolveDeliveries(
  rules: NotificationRule[],
  eventKey: string,
  ctx: { ownerId?: string },
  dir: RecipientDirectory,
): Delivery[] {
  const out: Delivery[] = [];
  for (const r of rules) {
    if (!r.enabled || r.eventKey !== eventKey) continue;
    let users: string[] = [];
    switch (r.recipients.kind) {
      case 'roles':
        users = r.recipients.roleIds.flatMap((id) => dir.usersWithRole(id));
        break;
      case 'owner':
        users = ctx.ownerId ? [ctx.ownerId] : [];
        break;
      case 'users':
        users = r.recipients.userIds;
        break;
      case 'buyerAdmins':
        users = dir.buyerAdmins();
        break;
    }
    for (const userId of new Set(users)) for (const channel of r.channels) out.push({ ruleId: r.id, userId, channel, templateId: r.templateId });
  }
  return out;
}
