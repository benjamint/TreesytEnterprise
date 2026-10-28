import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import '@/stores';
import { useBuyingStore } from '@/stores/buyingStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSupportStore } from '@/stores/supportStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useAccessStore } from '@/stores/accessStore';
import { useLandStore } from '@/stores/landStore';
import { useLoanStore } from '@/stores/loanStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sharedCommunities, sharedFarmers } from './sharingService';
import { commitImport, importFields, undoImport, validateRows, type Parsed } from './importService';
import { createTransfer, receiveInbound } from './inventoryService';
import { sendRecoveryReminders } from './systemService';
import { farmerScore } from './scoreService';

vi.mock('./paymentGateway', () => ({ transfer: async () => ({ status: 'SUCCESSFUL', providerRef: 'TX1' }), lookupName: async () => ({ name: 'X', match: true }) }));

const NOW = new Date('2026-10-18T10:00:00Z');
type Reg = { store: { setState: (s: object) => void }; seed: (s: unknown) => object };
function load() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const s = buildSeed(NOW);
  for (const r of (window as unknown as { __treesytStores: Reg[] }).__treesytStores) r.store.setState({ ...r.seed(s), seeded: true });
  useSessionStore.setState({ userId: 'u_ama', orgId: ORG.vitara } as never);
}

describe('A5 shared farmers and communities', () => {
  beforeAll(load);
  it('Kakao Ivoire sees the two communities Vitara shares, with their farmers, read-only', () => {
    const cs = sharedCommunities(ORG.kakao);
    expect(cs).toHaveLength(2);
    expect(cs.every((x) => x.row.orgId === ORG.vitara && x.fromOrgId === ORG.vitara)).toBe(true);
    const fs = sharedFarmers(ORG.kakao);
    const ids = new Set(cs.map((x) => x.row.id));
    expect(fs.length).toBeGreaterThan(0);
    expect(fs.every((x) => ids.has(x.row.communityId))).toBe(true);
    expect(sharedCommunities(ORG.vitara)).toHaveLength(0);
  });
});

describe('C6 imports that arrived with their modules', () => {
  beforeAll(load);
  const settings = () => useSettingsStore.getState().settings[ORG.vitara]!;
  const ctx = () => ({ orgId: ORG.vitara, country: 'GH', settings: settings(), places: {} as Record<string, string>, farmers: useFarmerStore.getState().farmers.filter((f) => f.orgId === ORG.vitara), actorId: 'u_ama' });
  const run = (type: Parameters<typeof importFields>[0], headers: string[], rows: string[][], places: Record<string, string> = {}) => {
    const fields = importFields(type, ORG.vitara, settings(), 'en');
    const parsed: Parsed = { headers, rows };
    const mapping = Object.fromEntries(fields.map((f) => [f.key, headers.indexOf(f.key) >= 0 ? headers.indexOf(f.key) : null]));
    const c = { ...ctx(), places };
    const preview = validateRows(type, fields, parsed, mapping, {}, {}, c);
    return { preview, result: commitImport(type, `${type}.csv`, fields, preview, c) };
  };

  it('groups and members', () => {
    const community = useFarmerStore.getState().farmers.find((f) => f.orgId === ORG.vitara)!.communityId;
    const g = run('groups', ['name', 'community', 'groupType'], [['Suglo Women Shea', 'X', 'VSLA'], ['', 'X', 'VSLA']], { X: community });
    expect(g.result.run.created).toBe(1);
    expect(g.preview[1]!.errors.name).toBe('required');
    const farmer = useFarmerStore.getState().farmers.find((f) => f.orgId === ORG.vitara)!;
    const m = run('members', ['group', 'farmer', 'memberRole'], [['Suglo Women Shea', farmer.farmerCode, 'TREASURER'], ['Nope', farmer.farmerCode, 'MEMBER']]);
    expect(m.result.run.created).toBe(1);
    expect(m.preview[1]!.errors.group).toBe('unknownGroup');
    const grp = useGroupStore.getState().groups.find((x) => x.name === 'Suglo Women Shea')!;
    expect(useGroupStore.getState().groupMemberships.some((x) => x.groupId === grp.id && x.farmerId === farmer.id && x.role === 'TREASURER')).toBe(true);
    expect(undoImport(m.result.run.id)).toBe(1);
    expect(useGroupStore.getState().groupMemberships.some((x) => x.groupId === grp.id)).toBe(false);
  });

  it('opening warehouse loads become bags in stock with a movement; duplicates are skipped', () => {
    const wh = useWarehouseStore.getState().warehouses.find((w) => w.orgId === ORG.vitara)!;
    const r = run('warehouseLoads', ['warehouse', 'bagCode', 'commodity', 'kg'], [[wh.name, 'OPEN-0001', 'shea', '84.5'], [wh.name, 'OPEN-0001', 'shea', '80']]);
    expect(r.preview.every((x) => !Object.keys(x.errors).length)).toBe(true);
    const bags = useBuyingStore.getState().bags.filter((b) => b.code === 'OPEN-0001');
    expect(bags).toHaveLength(1);
    expect(bags[0]!.status).toBe('IN_STOCK');
    expect(useWarehouseStore.getState().movements.some((m) => m.refId === bags[0]!.id && m.kind === 'IN')).toBe(true);
    expect(r.result.run.updated).toBe(1);
  });

  it('users become invitations; price lists add entries; past recoveries credit loans', () => {
    const u = run('users', ['name', 'email', 'role'], [['Adjoa Mensimah', 'adjoa.m@vitara.example', 'Finance officer'], ['X', 'not-an-email', 'Finance officer']]);
    expect(u.result.run.created).toBe(1);
    expect(u.preview[1]!.errors.email).toBe('badEmail');
    expect(useAccessStore.getState().invites.some((i) => i.email === 'adjoa.m@vitara.example' && i.status === 'PENDING')).toBe(true);
    const before = settings().priceList.length;
    run('priceLists', ['commodity', 'price', 'effectiveFrom'], [['shea', '6.10', '2026-11-01']]);
    expect(settings().priceList.length).toBe(before + 1);
    expect(settings().priceList[0]!.price.amountMinor).toBe(610);
    const loan = useLoanStore.getState().loans.find((l) => l.orgId === ORG.vitara && l.status === 'ACTIVE')!;
    const code = useFarmerStore.getState().farmers.find((f) => f.id === loan.farmerId)!.farmerCode;
    const n = loan.repayments.length;
    run('recoveries', ['farmer', 'date', 'amount', 'mode'], [[code, '2026-09-01', '50', 'CASH']]);
    expect(useLoanStore.getState().loans.find((l) => l.id === loan.id)!.repayments.length).toBe(n + 1);
  });
});

describe('H4 transfer out-vs-in bound', () => {
  beforeAll(load);
  it('a load that loses more than the company allows is flagged on the transfer', () => {
    const whs = useWarehouseStore.getState().warehouses.filter((w) => w.orgId === ORG.vitara);
    const from = whs.find((w) => useBuyingStore.getState().bags.filter((b) => b.warehouseId === w.id && b.status === 'IN_STOCK').length >= 3)!;
    const to = whs.find((w) => w.id !== from.id)!;
    const bags = useBuyingStore.getState().bags.filter((b) => b.warehouseId === from.id && b.status === 'IN_STOCK').slice(0, 3);
    const tr = createTransfer({ orgId: ORG.vitara, fromWarehouseId: from.id, kind: 'TRANSFER', toWarehouseId: to.id, bagCodes: bags.map((b) => b.code), actorId: 'u_ama' });
    const bound = useSettingsStore.getState().settings[ORG.vitara]!.inventoryRules.transferBoundsPct;
    const res = receiveInbound(tr.inboundId!, { bags: bags.map((b) => ({ code: b.code, status: 'ORIGINAL', receivedKg: b.weightKg * (1 - (bound + 3) / 100) })), actorId: 'u_ama' } as never);
    expect(res.transferOutOfBounds).toBe(true);
    expect(useWarehouseStore.getState().transfers.find((x) => x.id === tr.id)!.outOfBounds?.boundPct).toBe(bound);
  });
});

describe('F recovery reminders and C3 tree scoring', () => {
  beforeAll(load);
  it('sends reminders for open windows, then waits a week', () => {
    const w = useSupportStore.getState().windows.find((x) => x.orgId === ORG.vitara && x.status === 'ACTIVE');
    if (!w) return;
    useSupportStore.getState().saveWindow({ ...w, start: '2026-01-01', end: '2026-12-31', reminders: { sms: true, push: true }, remindedAt: undefined });
    const before = useNotificationStore.getState().outbox.length;
    const log = sendRecoveryReminders(ORG.vitara, NOW);
    expect(log.some((l) => /SMS/.test(l))).toBe(true);
    expect(useNotificationStore.getState().outbox.length).toBeGreaterThan(before);
    expect(sendRecoveryReminders(ORG.vitara, NOW).some((l) => /next in a week/.test(l))).toBe(true);
  });
  it('a farmer whose trees died scores lower than one without trees', () => {
    const tree = useLandStore.getState().trees.find((x) => x.orgId === ORG.vitara)!;
    const f = useFarmerStore.getState().farmers.find((x) => x.id === tree.farmerId)!;
    const ctx = { purchases: [], memberships: [], loans: [] };
    const none = farmerScore(f, { ...ctx, trees: [] }).total;
    const dead = farmerScore(f, { ...ctx, trees: [{ ...tree, state: 'DEAD' }] }).total;
    expect(dead).toBeLessThan(none);
  });
});
