import { describe, expect, it } from 'vitest';
import { resolveTerms, term, termVariables } from '.';

describe('terminology engine', () => {
  it('applies company overrides per language', () => {
    const t = resolveTerms({ fr: { agent: 'Délégué', agents: 'Délégués', community: 'Village' } }, 'fr');
    expect(term(t, 'agent')).toBe('Délégué');
    expect(term(t, 'community', { lower: true })).toBe('village');
    expect(term(resolveTerms(undefined, 'en'), 'purchaseRequest')).toBe('Purchase request');
    expect(termVariables(t).termLower.agents).toBe('délégués');
  });
});
