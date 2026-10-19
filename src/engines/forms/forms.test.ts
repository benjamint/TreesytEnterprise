import { describe, expect, it } from 'vitest';
import { completion, diffForms, evaluateFormula, evaluateLogic, formFlow, publish, questionKey, resolveOptions, validateAnswers, visibleQuestions, withCalculated, type FormSchema } from '.';

const form: FormSchema = {
  id: 'f', orgId: 'o', name: 'Farmer', binding: 'farmerProfile', version: 1, status: 'DRAFT',
  sections: [{
    id: 's', title: { en: 'S' },
    questions: [
      { id: 'hasPhone', type: 'yesNo', label: { en: 'Has phone' }, required: true },
      { id: 'phone', type: 'phone', label: { en: 'Phone' }, required: true, showIf: { combinator: 'AND', conditions: [{ questionId: 'hasPhone', op: 'equals', value: true }] } },
      { id: 'age', type: 'number', label: { en: 'Age' }, validation: { min: 18, max: 100 } },
    ],
  }],
};

describe('form engine', () => {
  it('applies show-if logic', () => {
    expect(visibleQuestions(form, { hasPhone: false }).map((q) => q.id)).toEqual(['hasPhone', 'age']);
    expect(visibleQuestions(form, { hasPhone: true }).map((q) => q.id)).toContain('phone');
    expect(evaluateLogic({ combinator: 'OR', conditions: [{ questionId: 'a', op: 'isEmpty' }, { questionId: 'b', op: 'gt', value: 1 }] }, { a: 'x', b: 2 })).toBe(true);
  });
  it('validates required and ranges only on visible questions', () => {
    expect(validateAnswers(form, { hasPhone: false, age: 12 })).toEqual([{ questionId: 'age', code: 'min' }]);
    expect(validateAnswers(form, { hasPhone: true })).toEqual([{ questionId: 'phone', code: 'required' }]);
    expect(publish(form).version).toBe(2);
  });
});

describe('form engine — logic, formulas, versions', () => {
  const survey: FormSchema = {
    id: 's', orgId: 'o', name: 'Survey', binding: 'survey', version: 1, status: 'LIVE',
    sections: [
      { id: 'a', title: { en: 'A' }, questions: [
        { id: 'consent', type: 'yesNo', label: { en: 'Consent' }, jump: { when: { combinator: 'AND', conditions: [{ questionId: 'consent', op: 'equals', value: false }] }, to: 'END' } },
        { id: 'hh', type: 'number', label: { en: 'Household' } },
        { id: 'kids', type: 'number', label: { en: 'Children' }, requiredIf: { combinator: 'AND', conditions: [{ questionId: 'hh', op: 'gt', value: 2 }] } },
        { id: 'adults', type: 'calculated', label: { en: 'Adults' }, formula: 'hh - kids' },
        { id: 'skip', type: 'yesNo', label: { en: 'Skip B' }, jump: { when: { combinator: 'AND', conditions: [{ questionId: 'skip', op: 'equals', value: true }] }, to: 'c' } },
      ] },
      { id: 'b', title: { en: 'B' }, questions: [{ id: 'b1', type: 'shortText', label: { en: 'B1' }, required: true }] },
      { id: 'c', title: { en: 'C' }, questions: [{ id: 'c1', type: 'date', label: { en: 'C1' }, validation: { maxDate: '2026-12-31' } }] },
    ],
  };
  it('ends the form and jumps between sections', () => {
    expect(visibleQuestions(survey, { consent: false }).map((q) => q.id)).toEqual(['consent']);
    expect(formFlow(survey, { consent: true }).map((s) => s.section.id)).toEqual(['a', 'b', 'c']);
    expect(formFlow(survey, { consent: true, skip: true }).map((s) => s.section.id)).toEqual(['a', 'c']);
  });
  it('applies required-if, date ranges and formulas', () => {
    expect(validateAnswers(survey, { consent: true, hh: 5, skip: true }).map((e) => e.questionId)).toEqual(['kids']);
    expect(validateAnswers(survey, { consent: true, hh: 2, skip: true, c1: '2027-01-02' })).toEqual([{ questionId: 'c1', code: 'maxDate' }]);
    expect(withCalculated(survey, { hh: 6, kids: 4 }).adults).toBe(2);
    expect(evaluateFormula('(a + b) * 2 / 4', { a: 3, b: 5 })).toBe(4);
    expect(evaluateFormula('a + ', { a: 1 })).toBeNull();
    expect(evaluateFormula('a * 2', {})).toBeNull();
    expect(completion(survey, { consent: true, hh: 3 })).toBe(33);
  });
  it('diffs versions and makes question keys', () => {
    const next = { ...survey, sections: [...survey.sections, { id: 'd', title: { en: 'D' }, questions: [{ id: 'cert', type: 'selectOne' as const, label: { en: 'Certification' } }] }] };
    expect(diffForms(survey, next).added.map((q) => q.id)).toEqual(['cert']);
    expect(questionKey('Hectares de cacao', new Set())).toBe('hectaresDeCacao');
    expect(questionKey('Certification', new Set(['certification']))).toBe('certification2');
    expect(resolveOptions({ id: 'x', type: 'selectOne', label: {}, optionListId: 'l' }, [{ id: 'l', options: [{ value: 'a', label: { en: 'A' } }] }])).toHaveLength(1);
  });
});
