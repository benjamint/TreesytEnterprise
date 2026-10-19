import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { sampleFarmersCsv } from '@/data/samples/importSamples';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useImportStore } from '@/stores/importStore';
import { useLocationStore } from '@/stores/locationStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { applyTransform, autoMatch, commitImport, importFields, matchPlace, suggestTransform, undoImport, validateRows, type Transform } from './importService';
import { applyFix, assignToAgents, markValid, recheck } from './qualityService';

const orgId = ORG.vitara;

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  useLocationStore.setState({ nodes: s.nodes, seeded: true });
  useCommunityStore.setState({ communities: s.communities, seeded: true });
  useFarmerStore.setState({ farmers: s.farmers, seeded: true });
  useGroupStore.setState({ groups: s.groups, groupMemberships: s.groupMemberships, savings: s.savings, seeded: true });
  useAgentStore.setState({ agents: s.agents, seeded: true });
  useQualityStore.setState({ issues: s.qualityIssues, tasks: [], seeded: true });
  useImportStore.setState({ runs: [], seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

/** Journey 15 at the service level: sample file → fix 4 errors → 3 new flags → fix on the phone → resolved. */
describe('import + data quality (Journey 15)', () => {
  beforeAll(load);
  const settings = () => useSettingsStore.getState().settings[orgId]!;
  const farmers = () => useFarmerStore.getState().farmers.filter((f) => f.orgId === orgId);
  const communities = () => useCommunityStore.getState().communities.filter((c) => c.orgId === orgId);
  let flaggedIds: string[] = [];

  it('maps the sample, matches the misspelt community and finds exactly 4 errors', () => {
    const { csv } = sampleFarmersCsv({ orgId, lang: 'en', communities: communities(), farmers: farmers() });
    const [headers, ...rows] = csv.split('\n').map((l) => l.split(','));
    expect(rows).toHaveLength(50);
    const fields = importFields('farmers', orgId, settings(), 'en');
    const mapping = autoMatch(headers!, fields);
    for (const k of ['firstName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'community', 'householdSize', 'numberOfChildren', 'educationLevel', 'consent', 'registeredAt']) expect(mapping[k], k).not.toBeNull();
    const transforms: Record<string, Transform> = {};
    for (const f of fields) if (mapping[f.key] != null) transforms[f.key] = suggestTransform(f, rows.map((r) => r[mapping[f.key]!] ?? ''));
    expect(transforms.dateOfBirth).toBe('ddmmyyyy');
    expect(transforms.phone).toBe('leadingZero');
    expect(applyTransform('244123456', 'leadingZero')).toBe('0244123456');

    const placeList = communities().map((c) => ({ id: c.id, name: c.name, code: c.code }));
    const places: Record<string, string> = {};
    const fuzzy: string[] = [];
    for (const raw of new Set(rows.map((r) => r[mapping.community!]!))) {
      const m = matchPlace(raw, placeList);
      if (m.exact) places[raw] = m.exact.id;
      else { fuzzy.push(raw); places[raw] = m.suggestions[0]!.id; }
    }
    expect(fuzzy).toHaveLength(1);

    const ctx = { orgId, country: 'GH', settings: settings(), places, farmers: farmers() };
    const parsed = { headers: headers!, rows };
    let preview = validateRows('farmers', fields, parsed, mapping, transforms, {}, ctx);
    const bad = preview.filter((r) => Object.keys(r.errors).length);
    expect(bad.map((r) => [r.index, Object.values(r.errors)[0]])).toEqual([[7, 'required'], [15, 'badPhone'], [23, 'badDate'], [38, 'badGender']]);
    expect(preview[10]!.warnings[0]).toMatch(/^dupPhone:/);

    // Fix the four rows inline.
    const overrides = { '6:lastName': 'Bawa', '14:phone': '0244987001', '22:dateOfBirth': '1984-02-28', '37:gender': 'F' };
    preview = validateRows('farmers', fields, parsed, mapping, transforms, overrides, ctx);
    expect(preview.filter((r) => Object.keys(r.errors).length)).toHaveLength(0);

    const before = farmers().length;
    const res = commitImport('farmers', 'farmers-sample.csv', fields, preview, { ...ctx, actorId: 'u_ama' });
    expect(res.run.created).toBe(50);
    expect(farmers().length).toBe(before + 50);
    // Duplicate phone, age over 100, household of 25.
    expect(res.flags).toBe(3);
    const fresh = useQualityStore.getState().issues.filter((i) => i.source === 'IMPORT');
    expect(fresh.map((i) => i.ruleId).sort()).toEqual(['qr_age', 'qr_household', 'qr_phone']);
    flaggedIds = fresh.map((i) => i.id);
  });

  it('sends fixes to the agent’s phone and resolves them when fixed', () => {
    const tasks = assignToAgents(orgId, flaggedIds, 'u_ama', 'Please check with the farmer');
    expect(tasks).toHaveLength(3);
    expect(useQualityStore.getState().issues.filter((i) => flaggedIds.includes(i.id)).every((i) => i.status === 'ASSIGNED')).toBe(true);
    expect(useNotificationStore.getState().notifications.filter((n) => n.key === 'fixTask')).toHaveLength(3);

    const values: Record<string, Record<string, unknown>> = { qr_age: { age: 64 }, qr_household: { 'customFields.householdSize': 9 }, qr_phone: { phone: '+233249990011' } };
    for (const t of tasks) {
      const rule = useQualityStore.getState().issues.find((i) => i.id === t.issueIds[0])!.ruleId;
      expect(applyFix(t.id, values[rule]!, 'u_yaw')).toEqual({ resolved: 1, remaining: 0 });
    }
    expect(useQualityStore.getState().issues.filter((i) => flaggedIds.includes(i.id)).every((i) => i.status === 'RESOLVED')).toBe(true);
    expect(useQualityStore.getState().tasks.every((t) => t.status === 'DONE')).toBe(true);
    const fixedFarmers = farmers().filter((f) => tasks.some((t) => t.recordId === f.id));
    expect(fixedFarmers.every((f) => f.qualityStatus === 'OK' && f.version === 2)).toBe(true);
  });

  it('keeps a failing fix in the queue, marks valid with a reason, and undoes the import', () => {
    const f = farmers().find((x) => x.qualityStatus === 'FLAGGED')!;
    const open = useQualityStore.getState().issues.filter((i) => i.recordId === f.id && i.status === 'OPEN');
    markValid(orgId, open.map((i) => i.id), 'Checked by phone', 'u_ama');
    expect(useQualityStore.getState().issues.filter((i) => i.recordId === f.id && i.status === 'VALID')).toHaveLength(open.length);
    // A valid issue is not raised again on re-check.
    expect(recheck(orgId, 'farmer', [f.id], 'RECHECK').filter((i) => open.some((o) => o.ruleId === i.ruleId))).toHaveLength(0);

    const run = useImportStore.getState().runs[0]!;
    const before = farmers().length;
    expect(undoImport(run.id)).toBe(50);
    expect(farmers().length).toBe(before - 50);
    expect(useQualityStore.getState().issues.some((i) => i.source === 'IMPORT')).toBe(false);
    expect(useImportStore.getState().runs[0]!.status).toBe('UNDONE');
  });
});

describe('locations and communities import', () => {
  beforeAll(load);
  const settings = () => useSettingsStore.getState().settings[orgId]!;
  const ctx = () => ({ orgId, country: 'GH', settings: settings(), places: {} as Record<string, string>, farmers: [], actorId: 'u_ama' });

  it('adds missing nodes, rejects a skipped level, and undoes', () => {
    const fields = importFields('locations', orgId, settings(), 'en');
    const parsed = { headers: ['Region', 'District', 'Community'], rows: [['Upper West', 'Wa', 'Nyagli New'], ['Bono', '', 'Odumasi'], ['Bono', 'Sunyani West', '']] };
    const rows = validateRows('locations', fields, parsed, autoMatch(parsed.headers, fields), {}, {}, ctx());
    expect(rows.map((r) => Object.values(r.errors))).toEqual([[], ['gap'], []]);
    const before = useLocationStore.getState().nodes.length;
    const res = commitImport('locations', 'loc.csv', fields, rows, ctx());
    // Nyagli New under the existing district, plus Bono and Sunyani West.
    expect(res.run.created).toBe(3);
    expect(useLocationStore.getState().nodes.length).toBe(before + 3);
    undoImport(res.run.id);
    expect(useLocationStore.getState().nodes.length).toBe(before);
  });

  it('creates communities under a matched parent with a code from the pattern', () => {
    const fields = importFields('communities', orgId, settings(), 'en');
    const district = useLocationStore.getState().nodes.find((n) => n.orgId === orgId && n.levelId === settings().locationLevels[1]!.id)!;
    const parsed = { headers: ['Name', 'District', 'Population', 'Contact phone'], rows: [['Kpaguri', district.name, '640', '0244000111']] };
    const c = { ...ctx(), places: { [district.name]: district.id } };
    const rows = validateRows('communities', fields, parsed, autoMatch(parsed.headers, fields), {}, {}, c);
    expect(rows[0]!.errors).toEqual({});
    const res = commitImport('communities', 'com.csv', fields, rows, c);
    expect(res.run.created).toBe(1);
    const com = useCommunityStore.getState().communities.find((x) => x.name === 'Kpaguri')!;
    expect(com.code).toMatch(/^[A-Z]{2}-\d{3}$/);
    expect(com.contactPerson.phone).toBe('+233244000111');
  });
});
