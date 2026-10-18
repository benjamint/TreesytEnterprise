import type { ActivityEvent } from '@/types';
import { uid } from '@/lib/utils';

/**
 * Activity log (PRD 8.14): structured `{key, params}` events, rendered with
 * `t('activity.' + key, params)` in the viewer's language. Events are never edited.
 */
export function makeEvent(
  orgId: string,
  entity: string,
  entityId: string,
  key: string,
  params: Record<string, unknown>,
  actorId: string,
  meta: { device?: string; gps?: { lat: number; lng: number }; at?: string } = {},
): ActivityEvent {
  return Object.freeze({
    id: uid('act'),
    orgId,
    entity,
    entityId,
    key,
    params,
    actorId,
    at: meta.at ?? new Date().toISOString(),
    gps: meta.gps,
    meta: meta.device ? { device: meta.device } : undefined,
  });
}
