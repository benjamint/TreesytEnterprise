import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed } from '@/data/seed';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLoanStore } from '@/stores/loanStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { debtCheck, nextBagCode, type NewPurchase } from './buyingService';
import { resolveConflict, saveOrQueue, syncOutbox } from './mobileSync';
import { parse } from './speechService';
import './mobileHandlers';

vi.mock('@/lib/utils', async (orig) => ({ ...(await orig<typeof import('@/lib/utils')>()), latency: async () => {} }));

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  usePlatformStore.setState({ orgs: s.orgs, plans: s.plans, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, warehouses: s.warehouses, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useLoanStore.setState({ loans: s.loans, seeded: true } as never);
  useBuyingStore.setState({ requests: s.requests, purchases: s.purchases, bags: s.bags, expenses: s.expenses, suppliers: s.suppliers, aggregatorPurchases: s.aggregatorPurchases, seeded: true });
  usePaymentStore.setState({ payments: s.payments, wallets: s.wallets, collections: [], topUps: [], seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
  useOutboxStore.setState({ items: [] });
}

const YAW = 'u_yaw';

describe('Mobile offline queue and sync (PRD 4.3)', () => {
  beforeAll(load);
  const agent = () => useAgentStore.getState().agents.find((a) => a.userId === YAW)!;
  const request = () => useBuyingStore.getState().requests.find((r) => r.agentId === agent().id && r.sourcingModel === 'CASH_ADVANCE' && ['FUNDS_RECEIVED', 'TICKET_ACTIVATED'].includes(r.status))
    ?? useBuyingStore.getState().requests.find((r) => r.agentId === agent().id && ['FUNDS_RECEIVED', 'TICKET_ACTIVATED'].includes(r.status))!;
  const sellers = () => {
    const r = request();
    return useFarmerStore.getState().farmers.filter((f) => f.communityId === r.communityId && !debtCheck(r.orgId, f.id).blocked).slice(0, 3);
  };

  it('keeps offline saves on the phone until Sync, then writes them with a consolidated bag and SMS receipts', async () => {
    const r = request();
    const [a, b, c] = sellers();
    useMobileSessionStore.setState({ online: false });
    const before = new Set(useBuyingStore.getState().purchases.map((p) => p.id));
    const shared = nextBagCode(r.orgId);
    const own = nextBagCode(r.orgId, 1);
    const consolidated: NewPurchase[] = [{ farmerId: a!.id, quantity: 40, bagCodes: [shared] }, { farmerId: b!.id, quantity: 38, bagCodes: [shared] }];
    const q1 = await saveOrQueue({ orgId: r.orgId, userId: YAW, type: 'purchase', label: 'consolidated', payload: { requestId: r.id, items: consolidated } });
    const q2 = await saveOrQueue({ orgId: r.orgId, userId: YAW, type: 'purchase', label: 'voice', payload: { requestId: r.id, items: [{ farmerId: c!.id, quantity: 60, voiceNote: true, bagCodes: [own] }] } });
    expect(q1.queued && q2.queued).toBe(true);
    expect(useOutboxStore.getState().items).toHaveLength(2);
    expect(useBuyingStore.getState().purchases.length).toBe(before.size);

    useMobileSessionStore.setState({ online: true });
    const out = await syncOutbox(YAW);
    expect(out.map((x) => x.outcome)).toEqual(['synced', 'synced']);
    expect(useOutboxStore.getState().items).toHaveLength(0);
    const added = useBuyingStore.getState().purchases.filter((p) => !before.has(p.id)).sort((x, y) => x.number.localeCompare(y.number));
    expect(added).toHaveLength(3);
    expect(added.every((p) => p.syncedFrom === 'MOBILE')).toBe(true);
    expect(added[0]!.bagCodes).toEqual([shared]);
    expect(added[1]!.bagCodes).toEqual([shared]);
    expect(added[0]!.consolidationRef).toBe(shared);
    expect(added[1]!.consolidationRef).toBe(shared);
    const bag = useBuyingStore.getState().bags.find((x) => x.code === shared)!;
    expect(bag.purchaseIds).toHaveLength(2);
    expect(bag.weightKg).toBe(78);
    expect(added[2]!.bagCodes).toEqual([own]);
    expect(added[2]!.evidence.voiceNote).toBeTruthy();
    expect(useNotificationStore.getState().outbox.filter((m) => m.channel === 'SMS')).toHaveLength(3);
  });

  it('saves straight away when online', async () => {
    const r = request();
    const [a] = sellers();
    const res = await saveOrQueue<{ purchases: { id: string }[] }>({ orgId: r.orgId, userId: YAW, type: 'purchase', label: 'online', payload: { requestId: r.id, items: [{ farmerId: a!.id, quantity: 20 }] } });
    expect(res.queued).toBe(false);
    expect(res.result?.purchases).toHaveLength(1);
  });

  it('flags a conflict when the office changed the record first, and resolves either way', async () => {
    const f = useFarmerStore.getState().farmers.find((x) => x.orgId === request().orgId)!;
    const base = { entity: 'farmer', id: f.id, updatedAt: f.updatedAt };
    useMobileSessionStore.setState({ online: false });
    await saveOrQueue({ orgId: f.orgId, userId: YAW, type: 'farmerEdit', label: 'edit', payload: { id: f.id, patch: { lastName: 'Phone' } }, base });
    useFarmerStore.getState().saveFarmer({ ...f, lastName: 'Office', updatedAt: new Date(Date.parse(f.updatedAt) + 60_000).toISOString() });
    useMobileSessionStore.setState({ online: true });
    const [r1] = await syncOutbox(YAW);
    expect(r1!.outcome).toBe('conflict');
    expect(useOutboxStore.getState().items[0]!.status).toBe('conflict');
    await resolveConflict(useOutboxStore.getState().items[0]!.id, 'mine');
    expect(useOutboxStore.getState().items).toHaveLength(0);
    expect(useFarmerStore.getState().farmers.find((x) => x.id === f.id)!.lastName).toBe('Phone');

    // Keep server: the phone's edit is dropped.
    const g = useFarmerStore.getState().farmers.find((x) => x.id === f.id)!;
    useMobileSessionStore.setState({ online: false });
    await saveOrQueue({ orgId: g.orgId, userId: YAW, type: 'farmerEdit', label: 'edit 2', payload: { id: g.id, patch: { lastName: 'Again' } }, base: { entity: 'farmer', id: g.id, updatedAt: g.updatedAt } });
    useFarmerStore.getState().saveFarmer({ ...g, updatedAt: new Date(Date.parse(g.updatedAt) + 60_000).toISOString() });
    useMobileSessionStore.setState({ online: true });
    await syncOutbox(YAW);
    await resolveConflict(useOutboxStore.getState().items[0]!.id, 'server');
    expect(useFarmerStore.getState().farmers.find((x) => x.id === f.id)!.lastName).toBe('Phone');
  });

  it('parses a voice transcript into a name and a weight', () => {
    expect(parse('Akosua Mensah, nkuto kilo 62')).toEqual({ name: 'Akosua Mensah', quantityKg: 62 });
    expect(parse('Aya Konan, 45,5 kilos')).toEqual({ name: 'Aya Konan', quantityKg: 45 });
  });
});
