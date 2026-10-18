import { createJSONStorage, persist, type PersistOptions, type StateStorage } from 'zustand/middleware';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { getSeed, SEED_VERSION, type SeedData } from '@/data/seed';

/**
 * Persistence and cross-tab sync (PRD 4.3).
 * - Stores persist to localStorage under `treesyt-demo:v1:{store}`, gzip-compressed (native CompressionStream).
 * - After each write, a BroadcastChannel('treesyt-demo') message `{store, action}` tells other tabs
 *   to rehydrate that store. Fallback: the `storage` event.
 * - Data is seeded from src/data on first boot (or after Reset demo data).
 */

export const KEY_PREFIX = 'treesyt-demo:v1:';
export const storageKey = (store: string) => `${KEY_PREFIX}${store}`;
const CHANNEL = 'treesyt-demo';

// ---------- Compressed storage ----------
const hasCompression = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function gzip(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'G:' + bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function gunzip(stored: string): Promise<string> {
  if (stored.startsWith('J:')) return stored.slice(2);
  if (!stored.startsWith('G:')) return stored;
  const stream = new Blob([base64ToBytes(stored.slice(2)) as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const pending = new Map<string, string>();
const running = new Set<string>();
/**
 * Values received from other tabs. Chrome can deliver the BroadcastChannel message before the other
 * tab's localStorage write is visible here, so the message carries the stored value itself.
 */
const incoming = new Map<string, string>();
let quotaWarned = false;
export const persistenceEvents = new EventTarget();

async function flush(name: string) {
  running.add(name);
  try {
    while (pending.has(name)) {
      const value = pending.get(name)!;
      pending.delete(name);
      const stored = hasCompression ? await gzip(value) : 'J:' + value;
      try {
        localStorage.setItem(name, stored);
      } catch {
        if (!quotaWarned) {
          quotaWarned = true;
          persistenceEvents.dispatchEvent(new Event('quota'));
        }
      }
      broadcast({ type: 'store', key: name, store: name.slice(KEY_PREFIX.length), action: 'set', data: stored });
    }
  } finally {
    running.delete(name);
  }
}

export const compressedStorage: StateStorage = {
  getItem: async (name) => {
    if (pending.has(name)) return pending.get(name)!;
    const fromTab = incoming.get(name);
    incoming.delete(name);
    const raw = fromTab ?? localStorage.getItem(name);
    if (raw == null) return null;
    try {
      return await gunzip(raw);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    pending.set(name, value);
    if (!running.has(name)) void flush(name);
  },
  removeItem: (name) => {
    pending.delete(name);
    localStorage.removeItem(name);
  },
};

// ---------- Cross-tab messages ----------
export type SyncMessage =
  | { type: 'store'; key: string; store?: string; action?: string; data?: string }
  | { type: 'reset' }
  | { type: 'announce'; key: string; params: Record<string, unknown> };

const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

export function broadcast(msg: SyncMessage) {
  if (channel) channel.postMessage(msg);
  else {
    // Fallback: a tiny key whose change fires the `storage` event in other tabs.
    try {
      if (msg.type === 'store') return; // the store key's own `storage` event carries the data
      localStorage.setItem(`${KEY_PREFIX}__msg`, JSON.stringify({ ...msg, t: Date.now() }));
    } catch {
      /* ignore */
    }
  }
}

/** Tell other tabs something worth a toast happened (e.g. "New purchase synced from Yaw Darko"). */
export function announce(key: string, params: Record<string, unknown> = {}) {
  broadcast({ type: 'announce', key, params });
}

// ---------- Store registry ----------
type Persisted = { seeded: boolean };
type AnyStore = UseBoundStore<StoreApi<Persisted>> & { persist: { rehydrate: () => Promise<void> | void } };

interface Registered {
  name: string;
  key: string;
  store: AnyStore;
  seed: (s: SeedData) => object;
}

const registry: Registered[] = [];
// Exposed for debugging the demo from the browser console.
if (typeof window !== 'undefined') (window as unknown as { __treesytStores: Registered[] }).__treesytStores = registry;

/**
 * Create a domain store whose data slice is persisted, compressed and synced across tabs.
 * `empty` is the shape before seeding; `seed` picks this store's slice from the demo data.
 */
export function defineStore<S extends object, A extends object>(
  name: string,
  empty: S,
  seed: (s: SeedData) => S,
  actions: (set: StoreApi<S & Persisted>['setState'], get: () => S & Persisted) => A,
) {
  const dataKeys = Object.keys(empty) as (keyof S)[];
  const options: PersistOptions<S & A & Persisted, Partial<S & Persisted>> = {
    name: storageKey(name),
    storage: createJSONStorage(() => compressedStorage),
    version: SEED_VERSION,
    skipHydration: true,
    partialize: (state) => {
      const out: Partial<S & Persisted> = { seeded: state.seeded } as Partial<S & Persisted>;
      for (const k of dataKeys) (out as Record<keyof S, unknown>)[k] = state[k];
      return out;
    },
    // A different seed version means the data shape changed: start again from the seed.
    migrate: () => ({ seeded: false }) as Partial<S & Persisted>,
  };
  const useStore = create<S & A & Persisted>()(
    persist((set, get) => ({ ...empty, seeded: false, ...actions(set as StoreApi<S & Persisted>['setState'], get) }) as S & A & Persisted, options),
  );
  registry.push({ name, key: storageKey(name), store: useStore as unknown as AnyStore, seed: seed as (s: SeedData) => object });
  return useStore;
}

// ---------- Boot, sync and reset ----------
export const useBootStore = create<{ ready: boolean; progress: number }>(() => ({ ready: false, progress: 0 }));

let booted = false;
export async function bootStores(): Promise<void> {
  if (booted) return;
  booted = true;
  let done = 0;
  await Promise.all(
    registry.map(async (r) => {
      await r.store.persist.rehydrate();
      if (!r.store.getState().seeded) r.store.setState({ ...r.seed(getSeed()), seeded: true });
      useBootStore.setState({ progress: ++done / registry.length });
    }),
  );
  listen();
  useBootStore.setState({ ready: true, progress: 1 });
}

const announceListeners = new Set<(key: string, params: Record<string, unknown>) => void>();
export function onAnnounce(fn: (key: string, params: Record<string, unknown>) => void) {
  announceListeners.add(fn);
  return () => {
    announceListeners.delete(fn);
  };
}

function handle(msg: SyncMessage) {
  if (msg.type === 'reset') {
    // Give the other tab's localStorage removals a moment to become visible here.
    setTimeout(() => window.location.reload(), 300);
    return;
  }
  if (msg.type === 'announce') {
    announceListeners.forEach((fn) => fn(msg.key, msg.params));
    return;
  }
  const r = registry.find((x) => x.key === msg.key);
  if (!r) return;
  if (msg.data) incoming.set(msg.key, msg.data);
  void r.store.persist.rehydrate();
}

function listen() {
  if (channel) channel.onmessage = (e: MessageEvent<SyncMessage>) => handle(e.data);
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(KEY_PREFIX)) return;
    if (e.key === `${KEY_PREFIX}__msg` && e.newValue) handle(JSON.parse(e.newValue) as SyncMessage);
    else if (!channel && e.newValue) handle({ type: 'store', key: e.key, data: e.newValue });
  });
}

/** Help → Reset demo data: clear every `treesyt-demo:*` key and reseed in all tabs. */
export function resetDemoData() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('treesyt-demo:')) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  broadcast({ type: 'reset' });
  window.location.reload();
}

export function registeredStores() {
  return registry.map((r) => ({ name: r.name, key: r.key }));
}
