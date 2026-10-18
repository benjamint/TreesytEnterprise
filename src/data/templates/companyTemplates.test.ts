import { describe, expect, it } from 'vitest';
import { buildCompanySettings, emptyDraft, TEMPLATE_COMMODITIES } from './companyTemplates';
import { start, apply } from '@/engines/workflow';

describe('company templates', () => {
  it('builds a Ghana cashew company from the cashew template', () => {
    const d = { ...emptyDraft(), name: 'Ghana Cashew Exporters', template: 'cashew' as const, commodityIds: TEMPLATE_COMMODITIES.cashew, modules: ['buying' as const, 'farmers' as const], approvals: 'two' as const };
    const s = buildCompanySettings('org_gce', d);
    expect(s.orgId).toBe('org_gce');
    expect(s.commodities.map((c) => c.id)).toEqual(['com_cashew']);
    expect(s.locationLevels.map((l) => l.label.en)).toEqual(['Region', 'District', 'Community']);
    expect(s.paymentProviders.filter((p) => p.kind === 'MOBILE_MONEY').map((p) => p.id)).toEqual(['mtn_gh', 'telecel_gh', 'airteltigo_gh']);
    expect(s.modules.buying && s.modules.dashboard).toBe(true);
    expect(s.modules.carbon).toBe(false);
    expect(s.workflows.find((w) => w.docType === 'purchaseRequest')!.steps.map((x) => x.id)).toEqual(['mgmt', 'fin']);
  });

  it('adds a conditional director step above the threshold', () => {
    const d = { ...emptyDraft(), countries: ['CI'], currency: 'XOF', language: 'fr' as const, approvals: 'threeThreshold' as const, thresholdMajor: 2_000_000 };
    const s = buildCompanySettings('org_x', d);
    const def = s.workflows.find((w) => w.docType === 'purchaseRequest')!;
    const mgr = { id: 'm', roleIds: [], permissions: ['purchaseRequests.approveManagement'] };
    const small = apply(start(def, { id: 'a', createdBy: 'z', total: { amountMinor: 1_000_000, currency: 'XOF' } }).record, def, 'APPROVE', mgr).record;
    expect(small.wf.currentStepId).toBe('fin');
    const big = apply(start(def, { id: 'b', createdBy: 'z', total: { amountMinor: 3_000_000, currency: 'XOF' } }).record, def, 'APPROVE', mgr).record;
    expect(big.wf.currentStepId).toBe('director');
    expect(s.locationLevels).toHaveLength(4);
  });
});
