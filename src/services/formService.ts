import { useMemo } from 'react';
import type { FieldTask, FormBindingKey, FormRecord, OptionList, SurveyResponse } from '@/types';
import { completion, diffForms, withCalculated, type FormBinding, type FormSchema } from '@/engines/forms';
import { makeEvent } from '@/engines/activity';
import { BINDING_KEY } from '@/data/forms/library';
import { communityProfileForm, farmerProfileForm, groupProfileForm } from '@/data/forms/profiles';
import { uid } from '@/lib/utils';
import { useActivityStore } from '@/stores/activityStore';
import { useFormStore } from '@/stores/formStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActor } from '@/stores/hooks';

/**
 * Forms at runtime (PRD 8.3, G1–G2): the live version of each profile form, publishing,
 * responses and their review. Everything that renders a profile form reads it from here,
 * so publishing a change shows up on web registration, mobile registration and the lists.
 */

export const latestVersion = (f: FormRecord) => f.versions[f.versions.length - 1];

/** Inline shared option lists so renderers, answer views and exports see the current options. */
export function materialize(schema: FormSchema, lists: OptionList[]): FormSchema {
  const byId = new Map(lists.map((l) => [l.id, l]));
  return {
    ...schema,
    sections: schema.sections.map((s) => ({
      ...s,
      questions: s.questions.map((q) => (q.optionListId && byId.has(q.optionListId) ? { ...q, options: byId.get(q.optionListId)!.options } : q)),
    })),
  };
}

const TEMPLATE: Partial<Record<FormBinding, (orgId: string) => FormSchema>> = { farmerProfile: farmerProfileForm, communityProfile: communityProfileForm, groupProfile: groupProfileForm };

/** The form record bound to a profile in Settings → Forms, else the company's first live one. */
export function boundForm(forms: FormRecord[], bindings: Partial<Record<FormBindingKey, string>>, orgId: string, binding: FormBinding): FormRecord | undefined {
  const key = BINDING_KEY[binding];
  const id = key ? bindings[key] : undefined;
  const own = forms.filter((f) => f.orgId === orgId && f.binding === binding && f.versions.length);
  return own.find((f) => f.id === id) ?? own.find((f) => f.status === 'LIVE') ?? own[0];
}

function resolveLive(forms: FormRecord[], lists: OptionList[], bindings: Partial<Record<FormBindingKey, string>>, orgId: string, binding: FormBinding): FormSchema {
  const f = boundForm(forms, bindings, orgId, binding);
  const v = f && latestVersion(f);
  const own = lists.filter((l) => l.orgId === orgId);
  if (v) return materialize(v.schema, own);
  const t = TEMPLATE[binding];
  return materialize(t ? t(orgId) : { id: `${orgId}_${binding}`, orgId, name: binding, binding, version: 1, status: 'LIVE', sections: [] }, own);
}

/** Non-React access (services, imports). */
export function getLiveForm(orgId: string, binding: FormBinding): FormSchema {
  const { forms, optionLists } = useFormStore.getState();
  return resolveLive(forms, optionLists, useSettingsStore.getState().settings[orgId]?.formBindings ?? {}, orgId, binding);
}

/** The live profile form for the current company; re-renders when a new version is published. */
export function useLiveForm(binding: FormBinding, orgIdOverride?: string): FormSchema {
  const { orgId: current } = useActor();
  const orgId = orgIdOverride ?? current;
  const forms = useFormStore((s) => s.forms);
  const lists = useFormStore((s) => s.optionLists);
  const bindings = useSettingsStore((s) => s.settings[orgId]?.formBindings);
  return useMemo(() => resolveLive(forms, lists, bindings ?? {}, orgId, binding), [forms, lists, bindings, orgId, binding]);
}

/** A form record's schema to fill: latest published version, or the draft while testing. */
export function fillSchema(f: FormRecord, lists: OptionList[]): FormSchema {
  const v = latestVersion(f);
  return materialize(f.status === 'TEST' || !v ? f.draft : v.schema, lists.filter((l) => l.orgId === f.orgId));
}

const comparable = (s: FormSchema) => JSON.stringify({ name: s.name, sections: s.sections });
export function isDraftDirty(f: FormRecord): boolean {
  const v = latestVersion(f);
  return !v || comparable(v.schema) !== comparable(f.draft);
}

function log(orgId: string, entity: string, id: string, key: string, params: Record<string, unknown>, actorId: string, device = 'web') {
  useActivityStore.getState().log(makeEvent(orgId, entity, id, key, params, actorId, { device }));
}

export function createForm(orgId: string, name: string, binding: FormBinding, sections: FormSchema['sections'], actorId: string, extra: Partial<FormRecord> = {}): FormRecord {
  const id = uid('frm');
  const now = new Date().toISOString();
  const f: FormRecord = {
    id, orgId, name, binding, status: 'DRAFT', ownerId: actorId, createdAt: now, updatedAt: now,
    draft: { id, orgId, name, binding, version: 1, status: 'DRAFT', sections }, versions: [], assignment: { mode: 'all', ids: [] }, schedule: {}, testUserIds: [], ...extra,
  };
  useFormStore.getState().saveForm(f);
  log(orgId, 'form', id, 'form.created', { name }, actorId);
  return f;
}

/** Publish the draft as version n+1 (status Live). Records and responses keep their version. */
export function publishForm(formId: string, actorId: string, note?: string): { version: number; added: number; removed: number; changed: number } {
  const f = useFormStore.getState().forms.find((x) => x.id === formId)!;
  const prev = latestVersion(f);
  const version = (prev?.version ?? 0) + 1;
  const schema: FormSchema = { ...f.draft, name: f.name, version, status: 'LIVE' };
  const diff = diffForms(prev?.schema, schema);
  const now = new Date().toISOString();
  useFormStore.getState().updateForm(formId, {
    status: 'LIVE', versions: [...f.versions, { version, publishedAt: now, publishedBy: actorId, note, schema }],
    draft: { ...f.draft, version: version + 1, status: 'DRAFT' },
  });
  log(f.orgId, 'form', formId, 'form.published', { version, added: diff.added.length, removed: diff.removed.length }, actorId);
  return { version, added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length };
}

export function setFormStatus(formId: string, status: FormRecord['status'], actorId: string) {
  const f = useFormStore.getState().forms.find((x) => x.id === formId)!;
  useFormStore.getState().updateForm(formId, { status });
  log(f.orgId, 'form', formId, 'form.status', { status }, actorId);
}

/** Bring an older version back into the draft (it becomes live only when published). */
export function restoreVersion(formId: string, version: number, actorId: string) {
  const f = useFormStore.getState().forms.find((x) => x.id === formId)!;
  const v = f.versions.find((x) => x.version === version)!;
  useFormStore.getState().updateForm(formId, { draft: { ...v.schema, version: (latestVersion(f)?.version ?? 0) + 1, status: 'DRAFT' } });
  log(f.orgId, 'form', formId, 'form.restored', { version }, actorId);
}

export function submitResponse(input: {
  form: FormRecord; schema: FormSchema; answers: Record<string, unknown>; userId: string; agentId?: string; subject?: SurveyResponse['subject'];
  gps?: SurveyResponse['gps']; startedAt?: string; device: 'mobile' | 'web'; replaces?: string; number?: string;
}): SurveyResponse {
  const { form, schema } = input;
  const answers = withCalculated(schema, input.answers);
  const store = useFormStore.getState();
  if (input.replaces) {
    // A "needs fix" response sent back from the phone keeps its number.
    const prev = store.responses.find((r) => r.id === input.replaces)!;
    const changed = Object.keys(answers).filter((k) => JSON.stringify(answers[k]) !== JSON.stringify(prev.answers[k]));
    store.updateResponse(prev.id, { answers, completion: completion(schema, answers), status: 'SUBMITTED', submittedAt: new Date().toISOString(), reviews: [...prev.reviews, { action: 'RESUBMITTED', by: input.userId, at: new Date().toISOString(), fields: changed }] });
    const q = useQualityStore.getState();
    for (const t of q.tasks.filter((x) => x.recordId === prev.id && x.status === 'OPEN')) q.updateTask(t.id, { status: 'DONE', doneAt: new Date().toISOString() });
    log(form.orgId, 'response', prev.id, 'response.resubmitted', { number: prev.number, fields: changed.length }, input.userId, input.device);
    return useFormStore.getState().responses.find((r) => r.id === prev.id)!;
  }
  const number = input.number ?? useSettingsStore.getState().issueNumber(form.orgId, 'surveyResponse', { date: new Date() });
  const r: SurveyResponse = {
    id: uid('resp'), orgId: form.orgId, formId: form.id, version: schema.version, number, subject: input.subject, agentId: input.agentId, userId: input.userId,
    startedAt: input.startedAt, submittedAt: new Date().toISOString(), gps: input.gps, status: 'SUBMITTED', answers, completion: completion(schema, answers),
    test: form.status === 'TEST' || undefined, device: input.device, reviews: [],
  };
  store.addResponse(r);
  log(form.orgId, 'response', r.id, 'response.submitted', { number, form: form.name }, input.userId, input.device);
  return r;
}

/** Approve, reject, or send back to the agent's phone with a comment. */
export function reviewResponse(id: string, action: 'APPROVED' | 'REJECTED' | 'NEEDS_FIX', actorId: string, comment?: string): FieldTask | undefined {
  const store = useFormStore.getState();
  const r = store.responses.find((x) => x.id === id)!;
  const now = new Date().toISOString();
  store.updateResponse(id, { status: action, reviews: [...r.reviews, { action, by: actorId, at: now, comment }] });
  log(r.orgId, 'response', id, `response.${action.toLowerCase()}`, { number: r.number, comment: comment ?? '' }, actorId);
  if (action !== 'NEEDS_FIX' || !r.agentId) return undefined;
  const task: FieldTask = { id: uid('task'), orgId: r.orgId, agentId: r.agentId, userId: r.userId, kind: 'surveyFix', entity: 'response', recordId: id, issueIds: [], fields: [], note: comment, status: 'OPEN', createdAt: now, createdBy: actorId };
  useQualityStore.getState().addTask(task);
  useNotificationStore.getState().push({ id: uid('ntf'), orgId: r.orgId, userId: r.userId, kind: 'ALERT', key: 'surveyFix', params: { number: r.number }, link: `/m/surveys/fix/${id}`, read: false, at: now });
  return task;
}

/** Edit answers on the web; the change is kept with the response (who, when, which fields). */
export function editResponse(id: string, answers: Record<string, unknown>, schema: FormSchema, actorId: string) {
  const store = useFormStore.getState();
  const r = store.responses.find((x) => x.id === id)!;
  const next = withCalculated(schema, answers);
  const fields = Object.keys({ ...r.answers, ...next }).filter((k) => JSON.stringify(r.answers[k]) !== JSON.stringify(next[k]));
  if (!fields.length) return 0;
  store.updateResponse(id, { answers: next, completion: completion(schema, next), reviews: [...r.reviews, { action: 'EDITED', by: actorId, at: new Date().toISOString(), fields }] });
  log(r.orgId, 'response', id, 'response.edited', { number: r.number, fields: fields.length }, actorId);
  return fields.length;
}
