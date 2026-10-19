import { latency, uid } from '@/lib/utils';
import { announce } from '@/stores/persistence';
import { useAccessStore } from '@/stores/accessStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore, type OutboxItem, type OutboxType } from '@/stores/outboxStore';

/**
 * Mobile offline layer (PRD 4.3, M2): every save on the phone goes through `saveOrQueue`. Online it
 * is written to the shared stores at once; offline it waits in the outbox until Sync. Each item type
 * registers how it is applied and, for edits, how a newer server version (a conflict) is detected.
 */

export interface SyncHandler {
  apply: (item: OutboxItem) => unknown;
  /** The server's current `updatedAt` for an edit's record (conflict when newer than the base). */
  serverVersion?: (item: OutboxItem) => string | undefined;
}
const handlers = new Map<OutboxType, SyncHandler>();
export function registerSyncHandler(type: OutboxType, h: SyncHandler) { handlers.set(type, h); }

export interface QueueInput { orgId: string; userId: string; type: OutboxType; label: string; payload: unknown; base?: OutboxItem['base'] }

/** Save now when online, or keep on the phone until Sync. Returns whether it was queued. */
export async function saveOrQueue<R = unknown>(input: QueueInput): Promise<{ queued: boolean; result?: R }> {
  const item: OutboxItem = { id: uid('ob'), createdAt: new Date().toISOString(), ...input };
  if (!useMobileSessionStore.getState().online) {
    useOutboxStore.getState().add(item);
    return { queued: true };
  }
  const result = (await handlers.get(item.type)?.apply(item)) as R | undefined;
  announce('mobileSaved', { label: item.label, name: nameOf(item.userId) });
  return { queued: false, result };
}

export interface SyncResult { id: string; label: string; type: OutboxType; outcome: 'synced' | 'conflict' | 'error'; error?: string }

const nameOf = (userId: string) => useAccessStore.getState().users.find((u) => u.id === userId)?.name ?? '';

/** When the office last changed the record behind an edit (for the conflict message). */
export const serverVersionOf = (item: OutboxItem) => (item.base ? handlers.get(item.type)?.serverVersion?.(item) : undefined);

const isConflict = (item: OutboxItem) => {
  const server = serverVersionOf(item);
  return !!(server && item.base && server > item.base.updatedAt);
};

/** Sync the user's outbox item by item, oldest first. Conflicts stay on the phone for a decision. */
export async function syncOutbox(userId: string, onResult?: (r: SyncResult) => void): Promise<SyncResult[]> {
  const items = useOutboxStore.getState().items.filter((i) => i.userId === userId);
  const out: SyncResult[] = [];
  for (const item of items) {
    await latency(250, 500);
    let r: SyncResult;
    if (isConflict(item)) {
      useOutboxStore.getState().update(item.id, { status: 'conflict' });
      r = { id: item.id, label: item.label, type: item.type, outcome: 'conflict' };
    } else {
      try {
        await handlers.get(item.type)?.apply(item);
        useOutboxStore.getState().remove([item.id]);
        r = { id: item.id, label: item.label, type: item.type, outcome: 'synced' };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        useOutboxStore.getState().update(item.id, { status: 'error', error });
        r = { id: item.id, label: item.label, type: item.type, outcome: 'error', error };
      }
    }
    out.push(r);
    onResult?.(r);
  }
  useMobileSessionStore.getState().markSynced();
  const synced = out.filter((r) => r.outcome === 'synced').length;
  if (synced) announce('mobileSynced', { count: synced, name: nameOf(userId) });
  return out;
}

/** Keep mine: apply the phone's version over the server's. Keep server: drop the phone's change. */
export async function resolveConflict(id: string, choice: 'mine' | 'server') {
  const item = useOutboxStore.getState().items.find((i) => i.id === id);
  if (!item) return;
  if (choice === 'mine') await handlers.get(item.type)?.apply(item);
  useOutboxStore.getState().remove([id]);
}

/** Rough size of what the phone sends, for the data-usage line on the Sync screen. */
export function payloadKb(items: OutboxItem[]) {
  return Math.max(1, Math.round(items.reduce((s, i) => s + JSON.stringify(i.payload ?? {}).length, 0) / 1024));
}
