/**
 * Form engine (PRD 8.3) — schema types and pure helpers. The web `<FormRenderer>` and the mobile
 * `<MobileFormRenderer>` both consume these so a form behaves identically everywhere: show-if and
 * jump logic, required-if, calculated fields, validation, completion and versioning.
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

/** Types that take options (inline or from a shared option list). */
export const CHOICE_TYPES: QuestionType[] = ['selectOne', 'selectMany', 'ranking'];
/** Types that display or compute, and are never answered. */
export const DISPLAY_TYPES: QuestionType[] = ['note', 'calculated', 'autoId'];
export const MEDIA_TYPES: QuestionType[] = ['image', 'audio', 'video', 'file'];

export type FormBinding =
  | 'survey' | 'farmerProfile' | 'communityProfile' | 'groupProfile' | 'nurseryProfile' | 'nurseryMonitoring'
  | 'treeMonitoring' | 'plotProfile' | 'plotMonitoring' | 'workshopFeedback' | 'recoveryFeedback' | 'agentReport' | 'customRecord';

export const FORM_BINDINGS: FormBinding[] = [
  'survey', 'farmerProfile', 'communityProfile', 'groupProfile', 'nurseryProfile', 'nurseryMonitoring', 'treeMonitoring',
  'plotProfile', 'plotMonitoring', 'workshopFeedback', 'recoveryFeedback', 'agentReport', 'customRecord',
];
export const PROFILE_BINDINGS: FormBinding[] = ['farmerProfile', 'communityProfile', 'groupProfile', 'nurseryProfile', 'plotProfile'];

export type Operator =
  | 'equals' | 'notEquals' | 'gt' | 'lt' | 'between' | 'contains' | 'inList' | 'isEmpty' | 'isNotEmpty' | 'anySelected' | 'allSelected';
export const OPERATORS: Operator[] = ['equals', 'notEquals', 'gt', 'lt', 'between', 'contains', 'inList', 'isEmpty', 'isNotEmpty', 'anySelected', 'allSelected'];

export interface Condition {
  questionId: string;
  op: Operator;
  value?: unknown;
}

export interface LogicGroup {
  combinator: 'AND' | 'OR';
  conditions: (Condition | LogicGroup)[];
}

type L = Partial<Record<'en' | 'fr', string>>;

export interface Option { value: string; label: L }

export interface Question {
  id: string;
  type: QuestionType;
  label: L;
  help?: L;
  placeholder?: L;
  required?: boolean;
  /** Required only when this logic holds. */
  requiredIf?: LogicGroup;
  default?: unknown;
  options?: Option[];
  optionListId?: string;
  /** Adds an "Other" choice with a free-text answer. */
  other?: boolean;
  randomise?: boolean;
  validation?: { min?: number; max?: number; minLength?: number; maxLength?: number; regex?: string; minDate?: string; maxDate?: string };
  showIf?: LogicGroup;
  /** After this question: when the logic holds, go to a section (or END the form). */
  jump?: { when: LogicGroup; to: string };
  mapsTo?: string;
  sensitive?: boolean;
  /** Calculated: arithmetic over other numeric answers, e.g. `householdSize - numberOfChildren`. */
  formula?: string;
  /** Rating / Likert / NPS. */
  scale?: { max?: number; style?: 'stars' | 'numbers' | 'checks'; low?: L; high?: L; labels?: L[] };
  media?: { max?: number; maxMb?: number };
  /** Record picker target. */
  recordType?: 'farmer' | 'community' | 'group' | 'plot' | 'bag';
  /** Table question: rows × columns. */
  rows?: Option[];
  columns?: Option[];
  children?: Question[];
}

export interface FormSection {
  id: string;
  title: L;
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

export interface OptionListLike { id: string; options: Option[] }

type Answers = Record<string, unknown>;

export const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

export function evaluateCondition(c: Condition, answers: Answers): boolean {
  const v = answers[c.questionId];
  switch (c.op) {
    case 'equals': return Array.isArray(v) ? v.includes(c.value) : v === c.value || (v != null && c.value != null && String(v) === String(c.value));
    case 'notEquals': return !(v === c.value || (v != null && c.value != null && String(v) === String(c.value)));
    case 'gt': return !isEmpty(v) && Number(v) > Number(c.value);
    case 'lt': return !isEmpty(v) && Number(v) < Number(c.value);
    case 'between': {
      const [lo, hi] = c.value as [number, number];
      return !isEmpty(v) && Number(v) >= lo && Number(v) <= hi;
    }
    case 'contains': return typeof v === 'string' ? v.toLowerCase().includes(String(c.value).toLowerCase()) : Array.isArray(v) && v.includes(c.value);
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

/**
 * The path through the form for the current answers: sections and questions that are shown,
 * after show-if logic and jump-to / end-form rules.
 */
export function formFlow(form: FormSchema, answers: Answers): { section: FormSection; questions: Question[] }[] {
  const out: { section: FormSection; questions: Question[] }[] = [];
  let i = 0;
  while (i < form.sections.length) {
    const s = form.sections[i]!;
    if (!evaluateLogic(s.showIf, answers)) { i++; continue; }
    const qs: Question[] = [];
    let next: number | 'END' | null = null;
    for (const q of s.questions) {
      if (!evaluateLogic(q.showIf, answers)) continue;
      qs.push(q);
      if (q.jump && !isEmpty(answers[q.id]) && evaluateLogic(q.jump.when, answers)) {
        if (q.jump.to === 'END') next = 'END';
        else {
          const target = form.sections.findIndex((x) => x.id === q.jump!.to);
          if (target > i) next = target;
        }
        break;
      }
    }
    out.push({ section: s, questions: qs });
    if (next === 'END') break;
    i = next ?? i + 1;
  }
  return out;
}

/** Visible questions given current answers (show-if logic at section and question level, jumps). */
export function visibleQuestions(form: FormSchema, answers: Answers): Question[] {
  return formFlow(form, answers).flatMap((s) => s.questions);
}

export function allQuestions(form: FormSchema): Question[] {
  return form.sections.flatMap((s) => s.questions);
}

export type ValidationError = { questionId: string; code: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'minDate' | 'maxDate' };

export function isRequired(q: Question, answers: Answers): boolean {
  return !!q.required || (!!q.requiredIf && q.requiredIf.conditions.length > 0 && evaluateLogic(q.requiredIf, answers));
}

export function validateAnswers(form: FormSchema, answers: Answers): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const q of visibleQuestions(form, answers)) {
    if (DISPLAY_TYPES.includes(q.type)) continue;
    const v = answers[q.id];
    if (isRequired(q, answers) && isEmpty(v)) { errors.push({ questionId: q.id, code: 'required' }); continue; }
    if (isEmpty(v) || !q.validation) continue;
    const val = q.validation;
    if (typeof v === 'number') {
      if (val.min != null && v < val.min) errors.push({ questionId: q.id, code: 'min' });
      if (val.max != null && v > val.max) errors.push({ questionId: q.id, code: 'max' });
    }
    if (typeof v === 'string') {
      const dateLike = ['date', 'dateTime', 'monthYear'].includes(q.type);
      if (dateLike) {
        if (val.minDate && v < val.minDate) errors.push({ questionId: q.id, code: 'minDate' });
        if (val.maxDate && v > val.maxDate) errors.push({ questionId: q.id, code: 'maxDate' });
      } else {
        if (val.minLength != null && v.length < val.minLength) errors.push({ questionId: q.id, code: 'minLength' });
        if (val.maxLength != null && v.length > val.maxLength) errors.push({ questionId: q.id, code: 'maxLength' });
        if (val.regex) {
          let ok = true;
          try { ok = new RegExp(val.regex).test(v); } catch { ok = true; }
          if (!ok) errors.push({ questionId: q.id, code: 'pattern' });
        }
      }
    }
  }
  return errors;
}

/** Share of the shown, answerable questions that have an answer (0–100). */
export function completion(form: FormSchema, answers: Answers): number {
  const qs = visibleQuestions(form, answers).filter((q) => !DISPLAY_TYPES.includes(q.type));
  if (!qs.length) return 100;
  return Math.round((qs.filter((q) => !isEmpty(answers[q.id])).length / qs.length) * 100);
}

// ---------------------------------------------------------------- Calculated fields

type Tok = { k: 'n'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][\w.]*|[-+*/()])/y;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < src.length && (re.lastIndex = pos, (m = re.exec(src)))) {
    const t = m[1]!;
    if (/^\d/.test(t)) out.push({ k: 'n', v: Number(t) });
    else if (/^[A-Za-z_]/.test(t)) out.push({ k: 'id', v: t });
    else out.push({ k: 'op', v: t });
    pos = re.lastIndex;
  }
  if (src.slice(pos).trim()) throw new Error('bad formula');
  return out;
}

/** Evaluate an arithmetic formula over answers (no `eval`). Returns null when it can't be computed. */
export function evaluateFormula(formula: string, answers: Answers): number | null {
  let toks: Tok[];
  try { toks = tokenize(formula); } catch { return null; }
  let i = 0;
  const peek = () => toks[i];
  const expr = (): number => {
    let v = term();
    while (peek()?.k === 'op' && (peek()!.v === '+' || peek()!.v === '-')) { const op = toks[i++]!.v; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek()?.k === 'op' && (peek()!.v === '*' || peek()!.v === '/')) { const op = toks[i++]!.v; const r = factor(); v = op === '*' ? v * r : v / r; }
    return v;
  };
  const factor = (): number => {
    const t = toks[i++];
    if (!t) throw new Error('end');
    if (t.k === 'n') return t.v;
    if (t.k === 'id') { const a = answers[t.v]; if (isEmpty(a) || !Number.isFinite(Number(a))) throw new Error('missing'); return Number(a); }
    if (t.v === '(') { const v = expr(); if (toks[i++]?.v !== ')') throw new Error('paren'); return v; }
    if (t.v === '-') return -factor();
    throw new Error('token');
  };
  try {
    const v = expr();
    if (i !== toks.length || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}

/** Fill calculated questions from the other answers. */
export function withCalculated(form: FormSchema, answers: Answers): Answers {
  let next = answers;
  for (const q of allQuestions(form)) {
    if (q.type !== 'calculated' || !q.formula) continue;
    const v = evaluateFormula(q.formula, next);
    if (next[q.id] !== (v ?? undefined)) next = { ...next, [q.id]: v ?? undefined };
  }
  return next;
}

/** Defaults for a new response. */
export function defaultAnswers(form: FormSchema): Answers {
  const out: Answers = {};
  for (const q of allQuestions(form)) if (q.default !== undefined && q.default !== '') out[q.id] = q.default;
  return out;
}

/** Options for a choice question: inline, or from a shared option list. */
export function resolveOptions(q: Question, lists: OptionListLike[] = []): Option[] {
  if (q.optionListId) return lists.find((l) => l.id === q.optionListId)?.options ?? q.options ?? [];
  return q.options ?? [];
}

/** Publishing creates version n+1; records keep the version they were captured with. */
export function publish(form: FormSchema): FormSchema {
  return { ...form, version: form.version + 1, status: 'LIVE' };
}

/** What changed between two versions, for the publish summary and version history. */
export function diffForms(prev: FormSchema | undefined, next: FormSchema): { added: Question[]; removed: Question[]; changed: Question[] } {
  const before = new Map((prev ? allQuestions(prev) : []).map((q) => [q.id, q]));
  const after = new Map(allQuestions(next).map((q) => [q.id, q]));
  return {
    added: [...after.values()].filter((q) => !before.has(q.id)),
    removed: [...before.values()].filter((q) => !after.has(q.id)),
    changed: [...after.values()].filter((q) => before.has(q.id) && JSON.stringify(before.get(q.id)) !== JSON.stringify(q)),
  };
}

/** A short, unique key for a new question from its label ("Hectares de cacao" → hectaresDeCacao). */
export function questionKey(label: string, taken: Set<string>): string {
  const words = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('') || 'question';
  let key = /^\d/.test(base) ? `q${base}` : base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}
