import type { ActivityEvent, Attendance, AttendanceMethod, OrgSettings, SurveyResponse, TopicAudience, TopicCategory, TrainingTopic, Workshop } from '@/types';
import { nextNumber } from '@/engines/numbering';
import type { OpsResult } from './operations';
import { Rng } from './rng';

/**
 * Phase 15 seed (PRD G3, M10): the company's training catalogue and about thirty workshops —
 * held ones with attendance (method, rating, comment), photos and feedback responses; a few
 * cancelled and archived; planned ones ahead, including one today for the journey agent.
 */

export interface TrainingSeed { topics: TrainingTopic[]; workshops: Workshop[]; activity: ActivityEvent[] }

type TopicDef = [en: string, fr: string, category: TopicCategory, durationMin: number, audience?: TopicAudience, materials?: string[]];

interface Opts {
  orgId: string; seed: number; today: Date; lang: 'en' | 'fr'; officeUserId: string;
  topics: TopicDef[];
  /** Agent types that facilitate workshops. */
  agentTypeIds: string[];
  /** Has a workshop planned today (journey) and tomorrow. */
  journeyUserId?: string;
  held: number; cancelled: number; archived: number; planned: number;
  /** The company's workshop feedback form id (seeded responses are linked to held workshops). */
  feedbackFormId?: string;
  responses: SurveyResponse[];
}

const DAY = 86_400_000;

export function seedTraining(ops: OpsResult, settings: OrgSettings, o: Opts): TrainingSeed {
  const rng = new Rng(o.seed);
  const out: TrainingSeed = { topics: [], workshops: [], activity: [] };
  const now = o.today.getTime();
  const iso = (t: number) => new Date(t).toISOString();
  const issue = (at: number) => {
    const r = nextNumber(settings.numbering.find((p) => p.docType === 'workshop')!, ops.sequences, { date: new Date(at) });
    ops.sequences = r.sequences;
    return r.number;
  };
  const act = (id: string, key: string, params: Record<string, unknown>, actorId: string, at: string, device?: string) =>
    out.activity.push({ id: `${id}_act_${out.activity.length}`, orgId: o.orgId, entity: 'workshop', entityId: id, key, params, actorId, at, ...(device ? { meta: { device } } : {}) } as ActivityEvent);

  const created = iso(now - 400 * DAY);
  o.topics.forEach(([en, fr, category, durationMin, audience, materials], i) => {
    out.topics.push({ id: `${o.orgId}_top${i + 1}`, orgId: o.orgId, createdAt: created, updatedAt: created, createdBy: o.officeUserId, name: { en, fr }, category, durationMin, audience: audience ?? 'FARMERS', materials: materials ?? [], active: i !== o.topics.length - 1 || o.topics.length < 10 });
  });
  const topics = out.topics.filter((t) => t.active);
  const agents = ops.agents.filter((a) => o.agentTypeIds.includes(a.agentTypeId) && a.status === 'ACTIVE');
  const journey = o.journeyUserId ? ops.agents.find((a) => a.userId === o.journeyUserId) : undefined;
  const commsOf = (agentId: string) => ops.communities.filter((c) => c.agentIds.includes(agentId));
  const farmersIn = new Map<string, string[]>();
  for (const f of ops.farmers) farmersIn.set(f.communityId, [...(farmersIn.get(f.communityId) ?? []), f.id]);
  const groupsIn = (communityId: string) => ops.groups.filter((g) => g.communityId === communityId);
  const members = (groupId: string) => ops.groupMemberships.filter((m) => m.groupId === groupId && !m.leftAt).map((m) => m.farmerId);
  // Feedback responses by the farmer's community, consumed as workshops are held.
  const farmerCommunity = new Map(ops.farmers.map((f) => [f.id, f.communityId]));
  const feedback = new Map<string, string[]>();
  for (const r of o.responses.filter((x) => x.formId === o.feedbackFormId && x.subject?.entity === 'farmer')) {
    const c = farmerCommunity.get(r.subject!.id);
    if (c) feedback.set(c, [...(feedback.get(c) ?? []), r.id]);
  }
  const titleOf = (t: TrainingTopic) => t.name[o.lang] ?? t.name.en ?? '';
  const methods: [AttendanceMethod, number][] = [['NFC', 40], ['QR', 25], ['THUMBPRINT', 15], ['MANUAL', 20]];
  const comments = o.lang === 'fr'
    ? ['Très utile pour ma parcelle.', 'Je vais appliquer la taille cette saison.', 'Trop court, il faut une suite.', 'Bonne démonstration.', 'Le formateur parlait clairement.']
    : ['Very useful for my farm.', 'I will try grafting this season.', 'Too short, we want a follow-up.', 'Good demonstration.', 'The facilitator explained well.'];
  const guestNames = o.lang === 'fr' ? ['Agent du conseil agricole', 'Enseignant du village'] : ['District agric officer', 'Radio presenter'];

  const make = (kind: 'HELD' | 'CANCELLED' | 'ARCHIVED' | 'PLANNED', dayOffset: number, agent = rng.pick(agents), forced?: { communityId: string }): Workshop => {
    const comms = commsOf(agent.id);
    const c = forced ? ops.communities.find((x) => x.id === forced.communityId)! : rng.pick(comms.length ? comms : ops.communities);
    const topic = rng.pick(topics);
    const date = now + dayOffset * DAY;
    const group = !forced && rng.chance(0.35) ? rng.pick(groupsIn(c.id).length ? groupsIn(c.id) : [undefined]) : undefined;
    const expected = rng.int(15, 35);
    const at = date - rng.int(10, 30) * DAY;
    const id = `${o.orgId}_ws${out.workshops.length + 1}`;
    const w: Workshop = {
      id, orgId: o.orgId, createdAt: iso(Math.min(at, now - DAY)), updatedAt: iso(Math.min(at, now - DAY)), createdBy: o.officeUserId, number: issue(Math.min(at, now)), topicId: topic.id, title: titleOf(topic),
      date: iso(date).slice(0, 10), location: o.lang === 'fr' ? rng.pick(['Sous le grand arbre', 'Salle de la coopérative', 'École primaire', 'Magasin du village']) : rng.pick(['Chief’s palace', 'Community centre', 'Primary school', 'Under the big shea tree']),
      communityId: c.id, groupId: group?.id, agentId: agent.id, expected, status: kind === 'ARCHIVED' ? 'ARCHIVED' : kind, attendance: [], images: [], feedbackResponseIds: [],
      device: 'web',
    };
    act(id, 'workshop.planned', { title: topic.name, date: w.date }, o.officeUserId, w.createdAt);
    if (kind === 'HELD' || kind === 'ARCHIVED') {
      const start = date + rng.int(8, 11) * 3_600_000;
      const pool = rng.shuffle(group ? members(group.id) : farmersIn.get(c.id) ?? []);
      const n = Math.min(pool.length, Math.round(expected * rng.float(0.55, 1.15)));
      const list: Attendance[] = pool.slice(0, n).map((farmerId, k) => {
        const rated = rng.chance(0.9);
        return { id: `${id}_a${k + 1}`, farmerId, method: rng.weighted(methods), rating: rated ? rng.weighted([[5, 40], [4, 35], [3, 18], [2, 5], [1, 2]] as const) : undefined, comment: rated && rng.chance(0.2) ? rng.pick(comments) : undefined, at: iso(start + k * 40_000) };
      });
      if (settings.training.allowGuests && rng.chance(0.3)) list.push({ id: `${id}_g1`, guestName: rng.pick(guestNames), method: 'MANUAL', at: iso(start + 600_000) });
      w.attendance = list;
      w.startedAt = iso(start);
      w.heldAt = iso(start + 2 * 3_600_000);
      w.gps = { lat: Number((c.gps.lat + rng.float(-0.002, 0.002)).toFixed(6)), lng: Number((c.gps.lng + rng.float(-0.002, 0.002)).toFixed(6)), accuracy: rng.int(3, 9) };
      w.images = Array.from({ length: rng.int(1, 3) }, (_, k) => ({ id: `${id}_img${k + 1}`, name: k ? 'workshop-group.jpg' : 'workshop.jpg', at: w.heldAt!, by: agent.userId }));
      const fb = feedback.get(c.id) ?? [];
      w.feedbackResponseIds = fb.splice(0, rng.int(2, 6));
      w.device = 'mobile';
      w.updatedAt = w.heldAt;
      act(id, 'workshop.held', { count: list.length }, agent.userId, w.heldAt, 'mobile');
      if (kind === 'ARCHIVED') {
        w.archived = { at: iso(date + 30 * DAY), by: o.officeUserId, remarks: o.lang === 'fr' ? 'Clôturé après la saison ; rapport envoyé au partenaire.' : 'Closed after the season; report sent to the partner.' };
        act(id, 'workshop.archived', { remarks: w.archived.remarks }, o.officeUserId, w.archived.at);
      }
    }
    if (kind === 'CANCELLED') {
      w.cancelled = { at: iso(date - 2 * DAY), by: o.officeUserId, reason: o.lang === 'fr' ? 'Funérailles au village ce jour-là.' : 'Funeral in the community that day.' };
      act(id, 'workshop.cancelled', { reason: w.cancelled.reason }, o.officeUserId, w.cancelled.at);
    }
    return w;
  };

  for (let i = 0; i < o.held; i++) out.workshops.push(make('HELD', -rng.int(3, 170)));
  for (let i = 0; i < o.archived; i++) out.workshops.push(make('ARCHIVED', -rng.int(200, 320)));
  for (let i = 0; i < o.cancelled; i++) out.workshops.push(make('CANCELLED', -rng.int(5, 60)));
  for (let i = 0; i < o.planned; i++) out.workshops.push(make('PLANNED', rng.int(2, 40)));
  if (journey) {
    const home = commsOf(journey.id)[0];
    out.workshops.push(make('PLANNED', 0, journey, home ? { communityId: home.id } : undefined));
    out.workshops.push(make('PLANNED', 1, journey, home ? { communityId: (commsOf(journey.id)[1] ?? home).id } : undefined));
  }
  return out;
}
