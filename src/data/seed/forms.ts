import type { Agent, Community, Farmer, FarmerGroup, FormRecord, NumberingPattern, OptionList, SurveyResponse } from '@/types';
import { completion, defaultAnswers, formFlow, resolveOptions, withCalculated, type FormSchema, type Question } from '@/engines/forms';
import { nextNumber } from '@/engines/numbering';
import { optionListsFor, seedForms } from '@/data/forms/library';
import { Rng } from './rng';

/**
 * Forms, option lists and survey / monitoring responses (PRD 12: Vitara 1,500 responses).
 * Uses its own random stream so earlier seeded data doesn't move.
 */

const PLAN: Record<string, Record<string, number>> = {
  vit: { household: 620, sheaprocessing: 240, treemon: 400, nurserymon: 90, workshop: 150 },
  ki: { rdue: 260, workshop: 70, satisfaction: 6 },
};

/** Plausible ranges for seeded answers (validation bounds are deliberately wider). */
const RANGES: Record<string, [number, number]> = {
  members: [2, 14], childrenCount: [0, 7], waterMinutes: [5, 60], hungryMonths: [0, 4], membersPresent: [8, 28], plots: [1, 4],
  seedlingsAlive: [8, 30], seedlingsDead: [0, 6], heightM: [1.5, 12], kgPerWeek: [20, 300],
};

const SAMPLE_PHOTOS = ['sample:farm-1', 'sample:farm-2', 'sample:tree-1', 'sample:group-1', 'sample:nursery-1'];

function answerFor(q: Question, rng: Rng, lists: OptionList[], ctx: { gps: { lat: number; lng: number }; date: Date }): unknown {
  const opts = resolveOptions(q, lists);
  const max = q.scale?.max ?? 5;
  switch (q.type) {
    case 'shortText': return rng.pick(['Good', 'Fine', 'As agreed', 'Checked', 'Seen on site']);
    case 'longText': return rng.pick(['Farmers asked for more training on pruning.', 'Weighing went well; the group was happy.', 'Water is far in the dry season.', 'Will plant more shea seedlings next year.', 'Asked about prices for next season.', '']);
    case 'number': {
      const range = RANGES[q.id];
      if (range) return rng.int(range[0], range[1]);
      const lo = q.validation?.min ?? 0;
      return rng.int(lo, Math.min(q.validation?.max ?? 20, lo + 12));
    }
    case 'decimal': if (RANGES[q.id]) return Math.round(rng.float(RANGES[q.id]![0], RANGES[q.id]![1]) * 10) / 10;
      return Math.round(rng.float(q.validation?.min ?? 0.5, Math.min(q.validation?.max ?? 12, 12)) * 10) / 10;
    case 'currency': return rng.int(2, 60) * 50;
    case 'yesNo': return rng.chance(0.68);
    case 'selectOne': return opts.length ? rng.pick(opts).value : undefined;
    case 'selectMany': { const real = opts.map((x) => x.value).filter((v) => v !== 'none'); return real.length ? rng.shuffle(real).slice(0, rng.int(1, Math.min(3, real.length))) : []; }
    case 'ranking': return rng.shuffle(opts.map((x) => x.value));
    case 'rating':
    case 'likert': return rng.weighted([[max, 3], [max - 1, 4], [Math.ceil(max / 2), 2], [2, 1], [1, 0.6]] as const);
    case 'nps': return rng.weighted([[10, 3], [9, 3], [8, 2], [7, 2], [5, 1], [3, 1]] as const);
    case 'date': return new Date(ctx.date.getTime() - rng.int(0, 5) * 86_400_000).toISOString().slice(0, 10);
    case 'gpsPoint': return { lat: ctx.gps.lat + rng.float(-0.01, 0.01), lng: ctx.gps.lng + rng.float(-0.01, 0.01), accuracy: rng.int(3, 18) };
    case 'image': return [rng.pick(SAMPLE_PHOTOS)];
    case 'scanCode': return `TS-${rng.int(10000, 99999)}`;
    case 'signature': return 'sample:signature';
    case 'contact': return { name: rng.pick(['Hawa', 'Rahinatu', 'Asana', 'Fuseina']), phone: `+23324${rng.int(1000000, 9999999)}` };
    case 'table': return Object.fromEntries((q.rows ?? []).map((r) => [r.value, Object.fromEntries((q.columns ?? []).map((c, ci) => [c.value, rng.int(20, 300) / (ci + 1)]))]));
    default: return undefined;
  }
}

function fill(schema: FormSchema, rng: Rng, lists: OptionList[], ctx: { gps: { lat: number; lng: number }; date: Date }, refuse: boolean): Record<string, unknown> {
  let answers: Record<string, unknown> = defaultAnswers(schema);
  // Walk the form in order so show-if and jumps follow earlier answers, as on the phone.
  for (let pass = 0; pass < 2; pass++) {
    for (const s of formFlow(schema, answers)) {
      for (const q of s.questions) {
        if (q.id in answers || q.type === 'note' || q.type === 'calculated') continue;
        if (q.id === 'consent') { answers.consent = !refuse; continue; }
        if (q.id === 'alive') { answers.alive = rng.chance(0.86); continue; }
        if (!q.required && rng.chance(0.08)) continue;
        const v = answerFor(q, rng, lists, ctx);
        if (v !== undefined) answers[q.id] = v;
      }
    }
  }
  if (typeof answers.seedlingsAlive === 'number' && typeof answers.seedlingsDead === 'number') {
    answers.seedlingsAlive = 150 + (answers.seedlingsAlive as number) * 12;
    answers.seedlingsDead = (answers.seedlingsDead as number) * 2;
  }
  if (typeof answers.members === 'number' && typeof answers.childrenCount === 'number') answers.childrenCount = Math.min(answers.childrenCount as number, Math.max(0, (answers.members as number) - 1));
  answers = withCalculated(schema, answers);
  // Keep only what the final path shows.
  const shown = new Set(formFlow(schema, answers).flatMap((s) => s.questions.map((q) => q.id)));
  return Object.fromEntries(Object.entries(answers).filter(([k]) => shown.has(k)));
}

export function seedFormData(opts: {
  orgId: string; prefix: 'vit' | 'ki'; ownerId: string; now: Date; seed: number; pattern: NumberingPattern;
  sequences: Record<string, number>; farmers: Farmer[]; communities: Community[]; groups: FarmerGroup[]; agents: Agent[];
}): { forms: FormRecord[]; optionLists: OptionList[]; responses: SurveyResponse[]; sequences: Record<string, number> } {
  const { orgId, now } = opts;
  const rng = new Rng(opts.seed);
  const forms = seedForms(orgId, opts.ownerId, now);
  const optionLists = optionListsFor(orgId, now.toISOString());
  const plan = PLAN[opts.prefix] ?? {};
  const field = opts.agents.filter((a) => a.status === 'ACTIVE' && !['at_wh', 'at_mag'].includes(a.agentTypeId));
  const comById = new Map(opts.communities.map((c) => [c.id, c]));
  let sequences = opts.sequences;
  const drafts: SurveyResponse[] = [];
  for (const form of forms) {
    const n = plan[form.id.replace(/^\w+?_frm_/, '')] ?? 0;
    for (let i = 0; i < n; i++) {
      const v = form.versions.length ? form.versions[form.versions.length - 1]! : null;
      const schema = v?.schema ?? form.draft;
      const end = form.schedule.end && form.status === 'CLOSED' ? new Date(form.schedule.end) : now;
      const start = form.schedule.start ? new Date(form.schedule.start) : new Date(now.getTime() - 150 * 86_400_000);
      const at = new Date(start.getTime() + rng.next() * Math.max(1, end.getTime() - start.getTime()));
      let subject: SurveyResponse['subject'];
      let com: Community | undefined;
      if (form.subject === 'farmer' || form.binding === 'workshopFeedback') {
        const f = rng.pick(opts.farmers);
        subject = form.subject === 'farmer' ? { entity: 'farmer', id: f.id } : undefined;
        com = comById.get(f.communityId);
      } else if (form.subject === 'farmerGroup') {
        const g = rng.pick(opts.groups);
        subject = { entity: 'farmerGroup', id: g.id };
        com = comById.get(g.communityId);
      } else com = rng.pick(opts.communities);
      const agent = field.find((a) => com?.agentIds.includes(a.id)) ?? rng.pick(field);
      const gps = com?.gps ?? { lat: 9.4, lng: -1.0 };
      const answers = fill(schema, rng, optionLists, { gps, date: at }, rng.chance(0.03));
      const r = nextNumber(opts.pattern, sequences, { date: at });
      sequences = r.sequences;
      const status = rng.weighted([['SUBMITTED', 72], ['APPROVED', 24], ['NEEDS_FIX', 1.4], ['REJECTED', 2]] as const);
      const reviewed = status !== 'SUBMITTED';
      drafts.push({
        id: `${form.id}_r${i + 1}`, orgId, formId: form.id, version: v?.version ?? 0, number: r.number, subject, agentId: agent?.id, userId: agent?.userId ?? opts.ownerId,
        startedAt: new Date(at.getTime() - rng.int(4, 25) * 60_000).toISOString(), submittedAt: at.toISOString(),
        gps: { lat: gps.lat + rng.float(-0.02, 0.02), lng: gps.lng + rng.float(-0.02, 0.02), accuracy: rng.weighted([[5, 4], [9, 3], [15, 2], [32, 1]] as const) },
        status, answers, completion: completion(schema, answers), test: form.status === 'TEST' || undefined, device: 'mobile',
        reviews: reviewed ? [{ action: status, by: opts.ownerId, at: new Date(at.getTime() + rng.int(1, 4) * 86_400_000).toISOString(), comment: status === 'NEEDS_FIX' ? 'Photo is missing or blurred — please retake.' : status === 'REJECTED' ? 'Duplicate of an earlier visit.' : undefined }] : [],
      });
    }
  }
  return { forms, optionLists, responses: drafts.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), sequences };
}
