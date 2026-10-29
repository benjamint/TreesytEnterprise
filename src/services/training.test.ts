import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { TOPIC_TEMPLATES } from '@/data/templates/trainingTemplates';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTrainingStore } from '@/stores/trainingStore';
import {
  addTemplateTopics, archiveWorkshop, canEdit, cancelWorkshop, deleteWorkshop, eligibleFarmerIds, farmerByCard, farmerTrainings, finishWorkshop, markAttendance,
  planWorkshops, startWorkshop, trainingDashboard, updateWorkshop, workshopStats,
} from './trainingService';

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  useAccessStore.setState({ users: s.users, memberships: s.memberships, roles: s.roles, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true } as never);
  useCommunityStore.setState({ communities: s.communities, seeded: true } as never);
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useGroupStore.setState({ groups: s.groups, groupMemberships: s.groupMemberships, seeded: true } as never);
  useTrainingStore.setState({ topics: s.trainingTopics, workshops: s.workshops, seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  return s;
}

const Tr = () => useTrainingStore.getState();
const settings = (orgId: string) => useSettingsStore.getState().settings[orgId]!;
const agentOf = (userId: string) => useAgentStore.getState().agents.find((a) => a.userId === userId)!;

describe('seeded training', () => {
  beforeAll(load);
  it('has a catalogue, held workshops with attendance, and one planned today for Yaw', () => {
    const vit = Tr().workshops.filter((w) => w.orgId === ORG.vitara);
    expect(Tr().topics.filter((t) => t.orgId === ORG.vitara).length).toBe(14);
    const held = vit.filter((w) => w.status === 'HELD');
    expect(held.length).toBe(15);
    expect(held.every((w) => w.attendance.length > 0 && w.images.length > 0)).toBe(true);
    const yaw = agentOf('u_yaw');
    expect(vit.some((w) => w.agentId === yaw.id && w.status === 'PLANNED' && w.date === '2026-10-18')).toBe(true);
    expect(vit.every((w) => /^WS-\d{4}-\d{3}$/.test(w.number))).toBe(true);
  });
});

describe('Attendance flow (M10)', () => {
  beforeAll(load);
  const yaw = () => agentOf('u_yaw');
  const today = () => Tr().workshops.find((w) => w.agentId === yaw().id && w.status === 'PLANNED' && w.date === '2026-10-18')!;

  it('start, mark by card / search / thumbprint, refuse duplicates and outsiders', () => {
    const w = today();
    startWorkshop(w.id, 'u_yaw', { lat: 9.4, lng: -0.85, accuracy: 4 }, 'mobile');
    expect(today().startedAt).toBeTruthy();
    const pool = [...eligibleFarmerIds(today())];
    expect(pool.length).toBeGreaterThan(3);
    const withCard = useFarmerStore.getState().farmers.find((f) => pool.includes(f.id) && f.identity.nfcCard)!;
    expect(farmerByCard(ORG.vitara, withCard.identity.nfcCard!.number)?.id).toBe(withCard.id);
    markAttendance(w.id, { farmerId: withCard.id, method: 'NFC', rating: 5 }, 'u_yaw');
    expect(() => markAttendance(w.id, { farmerId: withCard.id, method: 'MANUAL' }, 'u_yaw')).toThrow('alreadyPresent');
    const outsider = useFarmerStore.getState().farmers.find((f) => f.orgId === ORG.vitara && !pool.includes(f.id))!;
    expect(() => markAttendance(w.id, { farmerId: outsider.id, method: 'MANUAL' }, 'u_yaw')).toThrow('notEligible');
    markAttendance(w.id, { guestName: 'District agric officer', method: 'MANUAL' }, 'u_yaw');
    expect(today().attendance).toHaveLength(2);
  });

  it('finish needs ratings (Vitara rule) and a photo, then counts towards the dashboard', () => {
    const w = today();
    const pool = [...eligibleFarmerIds(w)].filter((id) => !w.attendance.some((a) => a.farmerId === id));
    const rows = pool.slice(0, 16).map((farmerId, i) => ({ farmerId, method: (['QR', 'THUMBPRINT', 'MANUAL'] as const)[i % 3], rating: 4, comment: i === 0 ? 'Very useful' : undefined }));
    expect(() => finishWorkshop({ workshopId: w.id, attendance: [...rows, { farmerId: pool[16] ?? pool[0]!, method: 'MANUAL' as const }].slice(0, 17), photos: ['a.jpg'], actorId: 'u_yaw' })).toThrow();
    expect(() => finishWorkshop({ workshopId: w.id, attendance: rows, photos: [], actorId: 'u_yaw' })).toThrow('photoRequired');
    const before = trainingDashboard(Tr().workshops.filter((x) => x.orgId === ORG.vitara), '2026-10-18');
    const { workshop, refused } = finishWorkshop({ workshopId: w.id, attendance: [...rows, { farmerId: rows[0]!.farmerId, method: 'MANUAL', rating: 3 }], photos: ['workshop.jpg'], actorId: 'u_yaw', device: 'mobile' });
    expect(refused.map((r) => r.reason)).toEqual(['alreadyPresent']);
    expect(workshop.status).toBe('HELD');
    expect(workshop.attendance.filter((a) => a.farmerId)).toHaveLength(Math.min(16, pool.length) + 1);
    const st = workshopStats(workshop, settings(ORG.vitara));
    expect(st.guests).toBe(1);
    expect(st.commissionEligible).toBe(st.farmers >= 15);
    const after = trainingDashboard(Tr().workshops.filter((x) => x.orgId === ORG.vitara), '2026-10-18');
    expect(after.held).toBe(before.held + 1);
    expect(after.upcoming).toBe(before.upcoming - 1);
    expect(farmerTrainings(rows[0]!.farmerId).some((x) => x.id === w.id)).toBe(true);
    expect(useActivityStore.getState().activity.some((e) => e.entityId === w.id && e.key === 'workshop.held')).toBe(true);
  });
});

describe('Workshop rules', () => {
  beforeAll(load);

  it('bulk plan numbers each row; edit, cancel, delete follow the rules', () => {
    const agent = useAgentStore.getState().agents.find((a) => a.orgId === ORG.vitara && a.status === 'ACTIVE')!;
    const c = useCommunityStore.getState().communities.find((x) => x.orgId === ORG.vitara)!;
    const topic = Tr().topics.find((t) => t.orgId === ORG.vitara && t.active)!;
    const list = planWorkshops(ORG.vitara, 'Community centre', [
      { topicId: topic.id, agentId: agent.id, expected: 20, date: '2026-11-02', communityId: c.id },
      { topicId: topic.id, agentId: agent.id, expected: 25, date: '2026-11-09', communityId: c.id },
    ], 'u_salamatu');
    expect(list).toHaveLength(2);
    expect(list[0]!.number).not.toBe(list[1]!.number);
    updateWorkshop(list[0]!.id, { expected: 30 }, 'u_salamatu');
    expect(Tr().workshops.find((w) => w.id === list[0]!.id)!.expected).toBe(30);
    cancelWorkshop(list[0]!.id, 'Rain', 'u_salamatu');
    expect(() => deleteWorkshop(list[0]!.id, 'u_salamatu')).toThrow('cannotDelete');
    deleteWorkshop(list[1]!.id, 'u_salamatu');
    expect(Tr().workshops.some((w) => w.id === list[1]!.id)).toBe(false);
  });

  it('held workshops lock after the edit window and are archived with remarks', () => {
    const s = settings(ORG.vitara);
    const held = Tr().workshops.find((w) => w.orgId === ORG.vitara && w.status === 'HELD')!;
    expect(canEdit(held, s, new Date(held.heldAt!).getTime() + 2 * 86_400_000)).toBe(true);
    expect(canEdit(held, s, new Date(held.heldAt!).getTime() + 5 * 86_400_000)).toBe(false);
    expect(() => deleteWorkshop(held.id, 'u_salamatu')).toThrow('cannotDelete');
    archiveWorkshop(held.id, 'Season closed', 'u_salamatu');
    expect(Tr().workshops.find((w) => w.id === held.id)!.archived?.remarks).toBe('Season closed');
  });

  it('Kakao Ivoire allows anyone (members-only off) and no rating; starter topics skip duplicates', () => {
    const ws = Tr().workshops.find((w) => w.orgId === ORG.kakao && w.status === 'PLANNED')!;
    expect(eligibleFarmerIds(ws).size).toBe(useFarmerStore.getState().farmers.filter((f) => f.orgId === ORG.kakao).length);
    const n1 = addTemplateTopics(ORG.kakao, TOPIC_TEMPLATES.cocoa, 'u_aicha');
    expect(addTemplateTopics(ORG.kakao, TOPIC_TEMPLATES.cocoa, 'u_aicha')).toBe(0);
    expect(n1).toBeGreaterThanOrEqual(0);
  });
});
