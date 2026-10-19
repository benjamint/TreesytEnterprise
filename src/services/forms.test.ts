import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import { allQuestions } from '@/engines/forms';
import { useActivityStore } from '@/stores/activityStore';
import { useFormStore } from '@/stores/formStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { draftFormSync, sanitizeDraft } from './formDraft';
import { getLiveForm, isDraftDirty, publishForm, reviewResponse, submitResponse } from './formService';
import { importFields } from './importService';

function load() {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  useSettingsStore.setState({ settings: s.settings, sequences: s.sequences, seeded: true });
  useFormStore.setState({ forms: s.forms, optionLists: s.optionLists, responses: s.responses, seeded: true });
  useQualityStore.setState({ issues: [], tasks: s.fieldTasks, seeded: true });
  useActivityStore.setState({ audit: [], activity: [], seeded: true });
  useNotificationStore.setState({ notifications: [], outbox: [], seeded: true });
}

describe('forms drive profiles (Journey 9)', () => {
  beforeAll(load);
  const formId = 'ki_frm_farmer';

  it('seeds Vitara with 12 forms and 1,500 responses, versioned profiles', () => {
    const { forms, responses } = useFormStore.getState();
    expect(forms.filter((f) => f.orgId === ORG.vitara)).toHaveLength(12);
    expect(responses.filter((r) => r.orgId === ORG.vitara)).toHaveLength(1500);
    expect(getLiveForm(ORG.vitara, 'farmerProfile').version).toBe(3);
    expect(getLiveForm(ORG.kakao, 'farmerProfile').sections.flatMap((s) => s.questions).some((q) => q.id === 'certification')).toBe(false);
  });

  it('publishing a new question makes it live for registration, import and lists', () => {
    const f = useFormStore.getState().forms.find((x) => x.id === formId)!;
    expect(isDraftDirty(f)).toBe(false);
    const list = useFormStore.getState().optionLists.find((l) => l.id === 'ki_ol_certifications')!;
    const draft = structuredClone(f.draft);
    draft.sections[0]!.questions.push({ id: 'certification', type: 'selectOne', label: { en: 'Certification', fr: 'Certification' }, optionListId: list.id, mapsTo: 'customFields.certification' });
    useFormStore.getState().updateForm(formId, { draft });
    expect(isDraftDirty(useFormStore.getState().forms.find((x) => x.id === formId)!)).toBe(true);
    const r = publishForm(formId, 'u_aicha', 'Certification added');
    expect(r).toMatchObject({ version: 3, added: 1, removed: 0 });
    const live = getLiveForm(ORG.kakao, 'farmerProfile');
    const q = live.sections.flatMap((s) => s.questions).find((x) => x.id === 'certification')!;
    expect(live.version).toBe(3);
    expect(q.options?.map((o) => o.value)).toEqual(['rainforestAlliance', 'fairtrade', 'none']);
    expect(importFields('farmers', ORG.kakao, useSettingsStore.getState().settings[ORG.kakao]!, 'fr').some((x) => x.key === 'certification')).toBe(true);
    // Editing the shared list changes the live options without republishing.
    useFormStore.getState().saveOptionList({ ...list, options: [...list.options, { value: 'organic', label: { en: 'Organic', fr: 'Bio' } }] });
    expect(getLiveForm(ORG.kakao, 'farmerProfile').sections.flatMap((s) => s.questions).find((x) => x.id === 'certification')!.options).toHaveLength(4);
  });

  it('reviews responses: send back → mobile task → resubmitted keeps its number', () => {
    const form = useFormStore.getState().forms.find((x) => x.id === 'vit_frm_household')!;
    const live = form.versions[form.versions.length - 1]!.schema;
    const r = submitResponse({ form, schema: live, answers: { consent: true, members: 6, childrenCount: 2, incomeSources: ['farming'] }, userId: 'u_yaw', agentId: 'vit_agt_u_yaw', device: 'mobile' });
    expect(r.number).toMatch(/^SR-\d{4}-\d{5}$/);
    expect(r.answers.adults).toBe(4);
    const task = reviewResponse(r.id, 'NEEDS_FIX', 'u_ama', 'Add a photo of the household');
    expect(task?.kind).toBe('surveyFix');
    expect(useNotificationStore.getState().notifications.some((n) => n.key === 'surveyFix' && n.userId === 'u_yaw')).toBe(true);
    const again = submitResponse({ form, schema: live, answers: { ...r.answers, photo: ['sample:farm-1'] }, userId: 'u_yaw', device: 'mobile', replaces: r.id });
    expect(again).toMatchObject({ number: r.number, status: 'SUBMITTED' });
    expect(useQualityStore.getState().tasks.find((x) => x.id === task!.id)!.status).toBe('DONE');
  });

  it('drafts a form from a description and checks model output', () => {
    const d = draftFormSync('Household survey on income, water and children going to school, with a photo');
    expect(d.sections[0]!.questions[0]!.id).toBe('consent');
    expect(d.topics).toEqual(expect.arrayContaining(['Household', 'Income', 'Water', 'Children']));
    const ids = d.sections.flatMap((s) => s.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(sanitizeDraft([{ title: 'A', questions: [{ label: 'Age', type: 'number' }, { label: 'Bad', type: 'hologram' }] }])?.[0]!.questions).toHaveLength(1);
    expect(sanitizeDraft('nope')).toBeNull();
    expect(allQuestions({ id: 'x', orgId: 'o', name: 'x', binding: 'survey', version: 1, status: 'DRAFT', sections: d.sections }).length).toBeGreaterThan(8);
  });
});
