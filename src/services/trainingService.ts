import type { Attendance, AttendanceMethod, OrgSettings, TrainingTopic, Workshop } from '@/types';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTrainingStore } from '@/stores/trainingStore';
import type { TopicTemplate } from '@/data/templates/trainingTemplates';

/**
 * Workshops and training (PRD G3, M10): catalogue, bulk planning, edit / archive / delete rules,
 * attendance (NFC / QR / thumbprint / manual) with eligibility rules, ratings and comments,
 * photos, feedback, the training dashboard and commission eligibility (J9).
 */

const T = () => useTrainingStore.getState();
const settingsOf = (orgId: string): OrgSettings => useSettingsStore.getState().settings[orgId]!;
const now = () => new Date().toISOString();
const DAY = 86_400_000;
type Device = 'web' | 'mobile';
const log = (orgId: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device: Device = 'web') =>
  useActivityStore.getState().log(makeEvent(orgId, 'workshop', id, key, params, actorId, { device }));
const workshopOf = (id: string) => T().workshops.find((w) => w.id === id)!;

export const topicName = (t: Pick<TrainingTopic, 'name'> | undefined, lang: 'en' | 'fr') => (t ? t.name[lang] ?? t.name.en ?? '' : '—');

// ---------------------------------------------------------------- Catalogue

export interface TopicInput { orgId: string; name: TrainingTopic['name']; category: TrainingTopic['category']; durationMin: number; materials: string[]; quizFormId?: string; audience: TrainingTopic['audience']; active?: boolean; actorId: string }

export function saveTopic(input: TopicInput, id?: string): TrainingTopic {
  const at = now();
  const existing = id ? T().topics.find((x) => x.id === id) : undefined;
  const t: TrainingTopic = {
    ...(existing ?? { id: uid('top'), orgId: input.orgId, createdAt: at, createdBy: input.actorId }),
    updatedAt: at, name: input.name, category: input.category, durationMin: input.durationMin, materials: input.materials, quizFormId: input.quizFormId, audience: input.audience, active: input.active ?? existing?.active ?? true,
  } as TrainingTopic;
  T().saveTopic(t);
  return t;
}

/** Add a sector's starter topics, skipping names the catalogue already has. */
export function addTemplateTopics(orgId: string, templates: TopicTemplate[], actorId: string) {
  const have = new Set(T().topics.filter((x) => x.orgId === orgId).map((x) => (x.name.en ?? '').toLowerCase()));
  const added = templates.filter((x) => !have.has(x.en.toLowerCase())).map((x) => saveTopic({ orgId, name: { en: x.en, fr: x.fr }, category: x.category, durationMin: x.durationMin, materials: x.materials, audience: x.audience, actorId }));
  return added.length;
}

// ---------------------------------------------------------------- Planning and rules

export interface PlanRow { topicId: string; agentId: string; groupId?: string; expected: number; date: string; communityId: string }

/** Plan workshops in bulk: one location, then rows of topic, agent, group, expected attendees, date, community. */
export function planWorkshops(orgId: string, location: string, rows: PlanRow[], actorId: string, lang: 'en' | 'fr' = 'en'): Workshop[] {
  const at = now();
  const list = rows.map((r) => {
    const topic = T().topics.find((x) => x.id === r.topicId)!;
    const w: Workshop = {
      id: uid('ws'), orgId, createdAt: at, updatedAt: at, createdBy: actorId, number: useSettingsStore.getState().issueNumber(orgId, 'workshop', { date: new Date(r.date) }),
      topicId: r.topicId, title: topicName(topic, lang), date: r.date, location, communityId: r.communityId, groupId: r.groupId || undefined, agentId: r.agentId,
      expected: r.expected, status: 'PLANNED', attendance: [], images: [], feedbackResponseIds: [], device: 'web',
    };
    return w;
  });
  T().saveWorkshops(list);
  for (const w of list) log(orgId, w.id, 'workshop.planned', { title: T().topics.find((x) => x.id === w.topicId)?.name ?? w.title, date: w.date }, actorId);
  return list;
}

/** Edit rules (company setting): planned workshops always; held ones within N days of being held. */
export function canEdit(w: Workshop, s: OrgSettings, at = Date.now()) {
  if (w.status === 'PLANNED') return true;
  if (w.status !== 'HELD' || !w.heldAt) return false;
  return s.training.editHeldDays > 0 && at - new Date(w.heldAt).getTime() <= s.training.editHeldDays * DAY;
}
export const canDelete = (w: Workshop, s: OrgSettings) => w.status === 'PLANNED' || (!s.training.deletePlannedOnly && w.status === 'CANCELLED');

export function updateWorkshop(id: string, patch: Partial<Pick<Workshop, 'date' | 'location' | 'agentId' | 'expected' | 'groupId' | 'topicId'>>, actorId: string) {
  const w = workshopOf(id);
  if (!canEdit(w, settingsOf(w.orgId))) throw new Error('locked');
  const topic = patch.topicId ? T().topics.find((x) => x.id === patch.topicId) : undefined;
  T().updateWorkshop(id, { ...patch, ...(topic ? { title: topicName(topic, 'en') } : {}) });
  log(w.orgId, id, 'workshop.edited', { fields: Object.keys(patch).join(', ') }, actorId);
}

export function cancelWorkshop(id: string, reason: string, actorId: string) {
  const w = workshopOf(id);
  if (w.status !== 'PLANNED') throw new Error('notPlanned');
  T().updateWorkshop(id, { status: 'CANCELLED', cancelled: { at: now(), by: actorId, reason } });
  log(w.orgId, id, 'workshop.cancelled', { reason }, actorId);
}

export function deleteWorkshop(id: string, actorId: string) {
  const w = workshopOf(id);
  if (!canDelete(w, settingsOf(w.orgId))) throw new Error('cannotDelete');
  T().removeWorkshop(id);
  log(w.orgId, id, 'workshop.deleted', { title: T().topics.find((x) => x.id === w.topicId)?.name ?? w.title }, actorId);
}

/** Held workshops are archived with remarks rather than deleted. */
export function archiveWorkshop(id: string, remarks: string, actorId: string) {
  const w = workshopOf(id);
  if (w.status !== 'HELD') throw new Error('notHeld');
  T().updateWorkshop(id, { status: 'ARCHIVED', archived: { at: now(), by: actorId, remarks } });
  log(w.orgId, id, 'workshop.archived', { remarks }, actorId);
}

// ---------------------------------------------------------------- Attendance

/** Farmers who may be marked present: the community's farmers (and the group's members when set), or anyone when rules allow. */
export function eligibleFarmerIds(w: Workshop): Set<string> {
  const s = settingsOf(w.orgId);
  const farmers = useFarmerStore.getState().farmers.filter((f) => f.orgId === w.orgId);
  if (!s.training.membersOnly) return new Set(farmers.map((f) => f.id));
  if (w.groupId) return new Set(useGroupStore.getState().groupMemberships.filter((m) => m.groupId === w.groupId && !m.leftAt).map((m) => m.farmerId));
  return new Set(farmers.filter((f) => f.communityId === w.communityId).map((f) => f.id));
}

/** Who a card or thumbprint belongs to (simulated readers resolve to a farmer). */
export function farmerByCard(orgId: string, value: string) {
  const v = value.trim().toUpperCase();
  return useFarmerStore.getState().farmers.find((f) => f.orgId === orgId && (f.identity.nfcCard?.number.toUpperCase() === v || f.farmerCode.toUpperCase() === v));
}

export interface AttendanceInput { farmerId?: string; guestName?: string; method: AttendanceMethod; rating?: number; comment?: string; at?: string }

/** Check one attendee against the rules; returns the reason it is refused, if any. */
export function attendanceProblem(w: Workshop, a: AttendanceInput, list: Pick<Attendance, 'farmerId'>[] = w.attendance): string | null {
  const s = settingsOf(w.orgId);
  if (a.guestName != null) return s.training.allowGuests ? (a.guestName.trim() ? null : 'guestName') : 'noGuests';
  if (!a.farmerId) return 'farmer';
  if (list.some((x) => x.farmerId === a.farmerId)) return 'alreadyPresent';
  if (!eligibleFarmerIds(w).has(a.farmerId)) return 'notEligible';
  return null;
}

export function startWorkshop(id: string, actorId: string, gps?: Workshop['gps'], device: Device = 'web') {
  const w = workshopOf(id);
  if (w.status !== 'PLANNED') throw new Error('notPlanned');
  T().updateWorkshop(id, { startedAt: w.startedAt ?? now(), gps: gps ?? w.gps });
  log(w.orgId, id, 'workshop.started', {}, actorId, device);
}

export function markAttendance(id: string, a: AttendanceInput, actorId: string): Attendance {
  const w = workshopOf(id);
  const problem = attendanceProblem(w, a);
  if (problem) throw new Error(problem);
  const row: Attendance = { id: uid('att'), farmerId: a.farmerId, guestName: a.guestName?.trim(), method: a.method, rating: a.rating, comment: a.comment?.trim() || undefined, at: a.at ?? now() };
  T().updateWorkshop(id, { attendance: [...w.attendance, row] });
  void actorId;
  return row;
}

export function rateAttendee(id: string, attendanceId: string, rating: number | undefined, comment: string | undefined) {
  const w = workshopOf(id);
  T().updateWorkshop(id, { attendance: w.attendance.map((x) => (x.id === attendanceId ? { ...x, rating, comment: comment?.trim() || undefined } : x)) });
}

export function removeAttendance(id: string, attendanceId: string) {
  const w = workshopOf(id);
  T().updateWorkshop(id, { attendance: w.attendance.filter((x) => x.id !== attendanceId) });
}

export interface SessionInput { workshopId: string; startedAt?: string; gps?: Workshop['gps']; attendance: AttendanceInput[]; photos: string[]; feedbackResponseIds?: string[]; actorId: string; device?: Device }

/**
 * Finish a workshop: attendance, photos and feedback in one go (the phone sends the whole session,
 * also when it was recorded offline). Refused rows are skipped and returned.
 */
export function finishWorkshop(input: SessionInput) {
  const w = workshopOf(input.workshopId);
  if (w.status !== 'PLANNED') throw new Error('notPlanned');
  const s = settingsOf(w.orgId);
  const accepted: Attendance[] = [...w.attendance];
  const refused: { row: AttendanceInput; reason: string }[] = [];
  for (const a of input.attendance) {
    const problem = attendanceProblem(w, a, accepted);
    if (problem) { refused.push({ row: a, reason: problem }); continue; }
    accepted.push({ id: uid('att'), farmerId: a.farmerId, guestName: a.guestName?.trim(), method: a.method, rating: a.rating, comment: a.comment?.trim() || undefined, at: a.at ?? now() });
  }
  if (!accepted.length) throw new Error('noAttendance');
  if (s.training.ratingRequired && accepted.some((a) => a.farmerId && a.rating == null)) throw new Error('ratingMissing');
  if (!input.photos.length) throw new Error('photoRequired');
  const at = now();
  const device = input.device ?? 'web';
  T().updateWorkshop(w.id, {
    status: 'HELD', heldAt: at, startedAt: input.startedAt ?? w.startedAt ?? at, gps: input.gps ?? w.gps, attendance: accepted, device,
    images: [...w.images, ...input.photos.map((name) => ({ id: uid('img'), name, at, by: input.actorId }))],
    feedbackResponseIds: [...w.feedbackResponseIds, ...(input.feedbackResponseIds ?? [])],
  });
  log(w.orgId, w.id, 'workshop.held', { count: accepted.length }, input.actorId, device);
  return { workshop: workshopOf(w.id), refused };
}

export function addWorkshopImage(id: string, name: string, actorId: string) {
  const w = workshopOf(id);
  T().updateWorkshop(id, { images: [...w.images, { id: uid('img'), name, at: now(), by: actorId }] });
}

// ---------------------------------------------------------------- Figures

/** Attendees, average rating, and whether the attendance counts for commission (J9 bounds). */
export function workshopStats(w: Workshop, s: OrgSettings) {
  const farmers = w.attendance.filter((a) => a.farmerId).length;
  const guests = w.attendance.length - farmers;
  const rated = w.attendance.filter((a) => a.rating != null);
  const avg = rated.length ? Math.round((rated.reduce((x, a) => x + a.rating!, 0) / rated.length) * 10) / 10 : null;
  const { minForCommission: min, maxForCommission: max } = s.training;
  const counts = w.status === 'HELD' || w.status === 'ARCHIVED';
  const eligible = counts && farmers >= min && farmers <= max;
  const note = !counts ? null : farmers < min ? 'belowMin' : farmers > max ? 'aboveMax' : null;
  return { attendees: w.attendance.length, farmers, guests, avgRating: avg, commissionEligible: eligible, commissionNote: note, min, max };
}

const isDone = (w: Workshop) => w.status === 'HELD' || w.status === 'ARCHIVED';

/** Created, held, upcoming, unique farmers trained, attendance by topic and agent, average rating. */
export function trainingDashboard(workshops: Workshop[], today = new Date().toISOString().slice(0, 10)) {
  const held = workshops.filter(isDone);
  const farmers = new Set(held.flatMap((w) => w.attendance.map((a) => a.farmerId).filter(Boolean) as string[]));
  const by = (key: (w: Workshop) => string) => {
    const m = new Map<string, number>();
    for (const w of held) m.set(key(w), (m.get(key(w)) ?? 0) + w.attendance.length);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const ratings = held.flatMap((w) => w.attendance.map((a) => a.rating).filter((r): r is number => r != null));
  const months = new Map<string, number>();
  for (const w of held) months.set(w.date.slice(0, 7), (months.get(w.date.slice(0, 7)) ?? 0) + 1);
  return {
    created: workshops.length, held: held.length, upcoming: workshops.filter((w) => w.status === 'PLANNED' && w.date >= today).length,
    cancelled: workshops.filter((w) => w.status === 'CANCELLED').length, overdue: workshops.filter((w) => w.status === 'PLANNED' && w.date < today).length,
    farmersTrained: farmers.size, attendance: held.reduce((s, w) => s + w.attendance.length, 0),
    avgRating: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    byTopic: by((w) => w.topicId), byAgent: by((w) => w.agentId), byMonth: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

/** A farmer's trainings (held workshops they attended). */
export const farmerTrainings = (farmerId: string, workshops = T().workshops) => workshops.filter((w) => isDone(w) && w.attendance.some((a) => a.farmerId === farmerId));
/** Held workshops in a community this calendar year (community score, training 15 points). */
export const communityWorkshopsThisYear = (communityId: string, workshops: Workshop[], at = new Date()) =>
  workshops.filter((w) => w.communityId === communityId && isDone(w) && new Date(w.date).getFullYear() === at.getFullYear()).length;
