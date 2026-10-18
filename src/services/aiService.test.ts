import { describe, expect, it } from 'vitest';
import { draftCompanySync } from './aiService';

describe('AI company draft (journey 12)', () => {
  it('drafts a Ghana cashew exporter', () => {
    const { draft, notes } = draftCompanySync('We are a cashew exporter in Ghana with 30 field agents buying from 5,000 farmers. We pre-finance inputs.');
    expect(draft.countries).toEqual(['GH']);
    expect(draft.currency).toBe('GHS');
    expect(draft.language).toBe('en');
    expect(draft.timezone).toBe('Africa/Accra');
    expect(draft.template).toBe('cashew');
    expect(draft.commodityIds).toEqual(['com_cashew']);
    expect(draft.type).toBe('SUPPLIER');
    expect(draft.planId).toBe('plan_growth');
    expect(draft.modules).toEqual(expect.arrayContaining(['support', 'recovery', 'buying']));
    expect(draft.name).toBe('Ghana Cashew Exporters');
    expect(draft.legalName).toBe('Ghana Cashew Exporters Ltd');
    expect(notes.length).toBeGreaterThan(4);
  });

  it('reads names, thresholds, French countries and admin emails', () => {
    const { draft } = draftCompanySync('Coopérative de cacao appelée Union Agni Bongouanou en Côte d’Ivoire, approval above 2,000,000 XOF. Admin is Awa Koné awa@agni.example');
    expect(draft.countries).toEqual(['CI']);
    expect(draft.currency).toBe('XOF');
    expect(draft.language).toBe('fr');
    expect(draft.template).toBe('cocoa');
    expect(draft.modules).toEqual(expect.arrayContaining(['eudr', 'plots']));
    expect(draft.approvals).toBe('threeThreshold');
    expect(draft.thresholdMajor).toBe(2_000_000);
    expect(draft.name).toBe('Union Agni Bongouanou');
    expect(draft.admins).toEqual([{ name: 'Awa Koné', email: 'awa@agni.example' }]);
  });
});
