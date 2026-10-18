/**
 * Form engine (PRD 8.3) — schema types and pure helpers. The web and mobile renderers
 * (Phase 6) both consume these so a form behaves identically everywhere.
 */
export type QuestionType =
  | 'shortText' | 'longText' | 'number' | 'decimal' | 'currency' | 'selectOne' | 'selectMany' | 'yesNo' | 'ranking'
  | 'rating' | 'likert' | 'nps' | 'date' | 'time' | 'dateTime' | 'monthYear' | 'year' | 'image' | 'audio' | 'video'
  | 'file' | 'signature' | 'gpsPoint' | 'gpsPolygon' | 'scanCode' | 'nfcTap' | 'thumbprint' | 'autoId' | 'contact'
  | 'email' | 'phone' | 'recordPicker' | 'locationPicker' | 'calculated' | 'note' | 'repeatGroup' | 'table';

export const QUESTION_TYPES: QuestionType[] = [
  'shortText', 'longText', 'number', 'decimal', 'currency', 'selectOne', 'selectMany', 'yesNo', 'ranking', 'rating', 'likert',
  'nps', 'date', 'time', 'dateTime', 'monthYear', 'year', 'image', 'audio', 'video', 'file', 'signature', 'gpsPoint',
  'gpsPolygon', 'scanCode', 'nfcTap', 'thumbprint', 'autoId', 'contact', 'email', 'phone', 'recordPicker', 'locationPicker',
  'calculated', 'note', 'repeatGroup', 'table',
];

export type FormBinding =
  | 'survey' | 'farmerProfile' | 'communityProfile' | 'groupProfile' | 'nurseryProfile' | 'nurseryMonitoring'
  | 'treeMonitoring' | 'plotProfile' | 'plotMonitoring' | 'workshopFeedback' | 'recoveryFeedback' | 'agentReport' | 'customRecord';

export type Operator =
  | 'equals' | 'notEquals' | 'gt' | 'lt' | 'between' | 'contains' | 'inList' | 'isEmpty' | 'isNotEmpty' | 'anySelected' | 'allSelected';

export interface Condition {
  questionId: string;
  op: Operator;
  value?: unknown;
}

export interface LogicGroup {
  combinator: 'AND' | 'OR';
  conditions: (Condition | LogicGroup)[];
}

export interface Question {
  id: string;
  type: QuestionType;
  label: Partial<Record<'en' | 'fr', string>>;
  help?: Partial<Record<'en' | 'fr', string>>;
  required?: boolean;
  options?: { value: string; label: Partial<Record<'en' | 'fr', string>> }[];
  optionListId?: string;
  validation?: { min?: number; max?: number; minLength?: number; maxLength?: number; regex?: string };
  showIf?: LogicGroup;
  mapsTo?: string;
  sensitive?: boolean;
  formula?: string;
  children?: Question[];
}

export interface FormSection {
  id: string;
  title: Partial<Record<'en' | 'fr', string>>;
  questions: Question[];
  showIf?: LogicGroup;
}

export interface FormSchema {
  id: string;
  orgId: string;
  name: string;
  binding: FormBinding;
  version: number;
  status: 'DRAFT' | 'TEST' | 'LIVE' | 'CLOSED';
  sections: FormSection[];
}

type Answers = Record<string, unknown>;

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

export function evaluateCondition(c: Condition, answers: Answers): boolean {
  const v = answers[c.questionId];
  switch (c.op) {
    case 'equals': return v === c.value;
    case 'notEquals': return v !== c.value;
    case 'gt': return Number(v) > Number(c.value);
    case 'lt': return Number(v) < Number(c.value);
    case 'between': {
      const [lo, hi] = c.value as [number, number];
      return Number(v) >= lo && Number(v) <= hi;
    }
    case 'contains': return typeof v === 'string' ? v.includes(String(c.value)) : Array.isArray(v) && v.includes(c.value);
    case 'inList': return Array.isArray(c.value) && c.value.includes(v);
    case 'isEmpty': return isEmpty(v);
    case 'isNotEmpty': return !isEmpty(v);
    case 'anySelected': return Array.isArray(v) && Array.isArray(c.value) && c.value.some((x) => v.includes(x));
    case 'allSelected': return Array.isArray(v) && Array.isArray(c.value) && c.value.every((x) => v.includes(x));
    default: return true;
  }
}

export function evaluateLogic(g: LogicGroup | undefined, answers: Answers): boolean {
  if (!g || g.conditions.length === 0) return true;
  const results = g.conditions.map((c) => ('combinator' in c ? evaluateLogic(c, answers) : evaluateCondition(c, answers)));
  return g.combinator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

/** Visible questions given current answers (show-if logic at section and question level). */
export function visibleQuestions(form: FormSchema, answers: Answers): Question[] {
  return form.sections
    .filter((s) => evaluateLogic(s.showIf, answers))
    .flatMap((s) => s.questions.filter((q) => evaluateLogic(q.showIf, answers)));
}

export type ValidationError = { questionId: string; code: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' };

export function validateAnswers(form: FormSchema, answers: Answers): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const q of visibleQuestions(form, answers)) {
    const v = answers[q.id];
    if (q.required && isEmpty(v)) { errors.push({ questionId: q.id, code: 'required' }); continue; }
    if (isEmpty(v) || !q.validation) continue;
    const val = q.validation;
    if (typeof v === 'number') {
      if (val.min != null && v < val.min) errors.push({ questionId: q.id, code: 'min' });
      if (val.max != null && v > val.max) errors.push({ questionId: q.id, code: 'max' });
    }
    if (typeof v === 'string') {
      if (val.minLength != null && v.length < val.minLength) errors.push({ questionId: q.id, code: 'minLength' });
      if (val.maxLength != null && v.length > val.maxLength) errors.push({ questionId: q.id, code: 'maxLength' });
      if (val.regex && !new RegExp(val.regex).test(v)) errors.push({ questionId: q.id, code: 'pattern' });
    }
  }
  return errors;
}

/** Publishing creates version n+1; records keep the version they were captured with. */
export function publish(form: FormSchema): FormSchema {
  return { ...form, version: form.version + 1, status: 'LIVE' };
}
