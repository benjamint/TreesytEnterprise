import { describe, expect, it } from 'vitest';
import { evaluateLogic, publish, validateAnswers, visibleQuestions, type FormSchema } from '.';

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
