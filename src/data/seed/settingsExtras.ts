import type { Commodity, FormRef, Lang, OrgSettings } from '@/types';
import type { NotificationRule } from '@/engines/notify';
import type { MessageTemplate } from '@/engines/templates';
import type { QualityRule } from '@/engines/rules';
import { toMinor } from '@/engines/money';

/**
 * Settings objects added in phase 3 (inventory rules, support, field team, notifications,
 * integrations, privacy…). Each template gets its own values; new companies get the generic set.
 */
export type ExtraSettings = Pick<
  OrgSettings,
  | 'features' | 'extraCharges' | 'pricing' | 'inventoryRules' | 'support' | 'fieldTeam' | 'qualityRules' | 'formLibrary'
  | 'formBindings' | 'biometrics' | 'notificationRules' | 'templates' | 'messaging' | 'integrations' | 'privacy'
>;

export const SUB_FEATURES: { module: string; key: string }[] = [
  { module: 'buying', key: 'voicePurchase' },
  { module: 'buying', key: 'consolidatedBags' },
  { module: 'buying', key: 'directPayment' },
  { module: 'buying', key: 'priceBoard' },
  { module: 'farmers', key: 'sharedFarmers' },
  { module: 'payments', key: 'bulkPay' },
  { module: 'payments', key: 'nameLookup' },
  { module: 'support', key: 'groupScoring' },
  { module: 'inventory', key: 'autoWriteOff' },
  { module: 'ai', key: 'voiceQuestions' },
  { module: 'fieldTeam', key: 'geofences' },
];

const FORM_BINDINGS = [
  'farmer', 'community', 'farmerGroup', 'nursery', 'plot', 'plotMonitoring', 'treeMonitoring', 'nurseryMonitoring',
  'workshopFeedback', 'recoveryFeedback', 'agentReport',
] as const;

function formLibrary(prefix: string, names: Record<(typeof FORM_BINDINGS)[number], string>, versions: Partial<Record<string, number>> = {}): FormRef[] {
  const base = FORM_BINDINGS.map((b) => ({ id: `${prefix}_frm_${b}`, name: names[b], binding: b, version: versions[b] ?? 1 }));
  // A second, older form for the main profiles so the binding is a real choice.
  const extra = (['farmer', 'community', 'farmerGroup'] as const).map((b) => ({ id: `${prefix}_frm_${b}_lite`, name: `${names[b]} (short)`, binding: b, version: 1 }));
  return [...base, ...extra];
}

const bindAll = (lib: FormRef[]) => Object.fromEntries(lib.filter((f) => !f.id.endsWith('_lite')).map((f) => [f.binding, f.id]));

function rules(): QualityRule[] {
  return [
    { id: 'qr_age', entity: 'farmer', field: 'age', operator: 'between', value: [16, 95], severity: 'warning', enabled: true },
    { id: 'qr_phone', entity: 'farmer', field: 'phone', operator: 'unique', duplicateScope: 'company', severity: 'warning', enabled: true },
    { id: 'qr_name', entity: 'farmer', field: 'firstName', operator: 'notEmpty', severity: 'block', enabled: true },
    { id: 'qr_dup_name', entity: 'farmer', field: 'lastName', operator: 'unique', duplicateScope: 'community', severity: 'info', enabled: false },
    { id: 'qr_crop', entity: 'farmer', field: 'primaryCrop', operator: 'notEmpty', severity: 'warning', enabled: true },
    { id: 'qr_pop', entity: 'community', field: 'population', operator: 'between', value: [20, 20000], severity: 'info', enabled: true },
  ];
}

function notificationRules(orgId: string): NotificationRule[] {
  const role = (t: string) => `${orgId}_role_${t}`;
  return [
    { id: 'nr_pr_submitted', eventKey: 'purchaseRequest.submitted', channels: ['IN_APP', 'EMAIL'], recipients: { kind: 'roles', roleIds: [role('operationsManager')] }, templateId: 'tpl_approval_email', enabled: true },
    { id: 'nr_pr_approved', eventKey: 'purchaseRequest.approved', channels: ['IN_APP', 'PUSH'], recipients: { kind: 'owner' }, templateId: 'tpl_approved_push', enabled: true },
    { id: 'nr_pr_finance', eventKey: 'purchaseRequest.managementApproved', channels: ['IN_APP', 'EMAIL'], recipients: { kind: 'roles', roleIds: [role('financeOfficer')] }, templateId: 'tpl_approval_email', enabled: true },
    { id: 'nr_payment_sent', eventKey: 'payment.sent', channels: ['SMS'], recipients: { kind: 'owner' }, templateId: 'tpl_payment_sms', enabled: true },
    { id: 'nr_payment_failed', eventKey: 'payment.failed', channels: ['IN_APP', 'EMAIL'], recipients: { kind: 'roles', roleIds: [role('financeOfficer')] }, templateId: 'tpl_payment_failed_email', enabled: true },
    { id: 'nr_purchase_receipt', eventKey: 'purchase.recorded', channels: ['SMS'], recipients: { kind: 'owner' }, templateId: 'tpl_receipt_sms', enabled: true },
    { id: 'nr_discrepancy', eventKey: 'inbound.discrepancy', channels: ['IN_APP', 'EMAIL'], recipients: { kind: 'roles', roleIds: [role('warehouseManager'), role('financeOfficer')] }, templateId: 'tpl_discrepancy_email', enabled: true },
    { id: 'nr_loan_overdue', eventKey: 'loan.overdue', channels: ['SMS'], recipients: { kind: 'owner' }, templateId: 'tpl_overdue_sms', enabled: false },
    { id: 'nr_dispatch', eventKey: 'dispatch.delivered', channels: ['IN_APP', 'EMAIL'], recipients: { kind: 'buyerAdmins' }, templateId: 'tpl_dispatch_email', enabled: true },
    { id: 'nr_invite', eventKey: 'user.invited', channels: ['EMAIL'], recipients: { kind: 'owner' }, templateId: 'tpl_invite_email', enabled: true },
  ];
}

function templates(): MessageTemplate[] {
  return [
    {
      id: 'tpl_approval_email', channel: 'EMAIL', eventKey: 'purchaseRequest.submitted',
      subject: { en: '{{docType}} {{number}} needs your approval', fr: '{{docType}} {{number}} attend votre validation' },
      body: {
        en: 'Hello {{recipient.name}},\n\n{{agent.name}} submitted {{number}} for {{amount}}. Open it to approve, hold or reject.\n\n{{company.signature}}',
        fr: 'Bonjour {{recipient.name}},\n\n{{agent.name}} a soumis {{number}} pour {{amount}}. Ouvrez-la pour valider, suspendre ou refuser.\n\n{{company.signature}}',
      },
    },
    { id: 'tpl_approved_push', channel: 'PUSH', eventKey: 'purchaseRequest.approved', body: { en: '{{number}} approved — {{amount}} is on its way.', fr: '{{number}} validée — {{amount}} arrive bientôt.' } },
    { id: 'tpl_payment_sms', channel: 'SMS', eventKey: 'payment.sent', body: { en: '{{company.name}}: you have been paid {{amount}} for {{quantity}} of {{commodity}}. Ref {{reference}}.', fr: '{{company.name}} : vous avez reçu {{amount}} pour {{quantity}} de {{commodity}}. Réf {{reference}}.' } },
    {
      id: 'tpl_payment_failed_email', channel: 'EMAIL', eventKey: 'payment.failed',
      subject: { en: 'Payment {{reference}} failed', fr: 'Échec du paiement {{reference}}' },
      body: { en: 'Payment {{reference}} of {{amount}} to {{payee.name}} failed: {{reason}}. You can retry it from Payments.', fr: 'Le paiement {{reference}} de {{amount}} à {{payee.name}} a échoué : {{reason}}. Vous pouvez le relancer depuis Paiements.' },
    },
    { id: 'tpl_receipt_sms', channel: 'SMS', eventKey: 'purchase.recorded', body: { en: '{{company.name}} receipt {{number}}: {{quantity}} {{commodity}} at {{price}} = {{amount}}. Thank you {{farmer.name}}.', fr: 'Reçu {{company.name}} {{number}} : {{quantity}} {{commodity}} à {{price}} = {{amount}}. Merci {{farmer.name}}.' } },
    {
      id: 'tpl_discrepancy_email', channel: 'EMAIL', eventKey: 'inbound.discrepancy',
      subject: { en: 'Discrepancy on {{number}} at {{warehouse}}', fr: 'Écart sur {{number}} à {{warehouse}}' },
      body: { en: '{{warehouse}} received {{received}} against {{expected}} expected. Review the discrepancy.', fr: '{{warehouse}} a reçu {{received}} pour {{expected}} attendus. Vérifiez l’écart.' },
    },
    { id: 'tpl_overdue_sms', channel: 'SMS', eventKey: 'loan.overdue', body: { en: '{{company.name}}: your balance of {{amount}} is overdue. Speak to {{agent.name}} to agree a repayment.', fr: '{{company.name}} : votre solde de {{amount}} est en retard. Parlez à {{agent.name}} pour convenir d’un remboursement.' } },
    {
      id: 'tpl_dispatch_email', channel: 'EMAIL', eventKey: 'dispatch.delivered',
      subject: { en: 'Your order {{number}} has been delivered', fr: 'Votre commande {{number}} a été livrée' },
      body: { en: 'Hello {{recipient.name}},\n\n{{quantity}} of {{commodity}} was delivered. Trace it to the farm on Traceboard.\n\n{{company.signature}}', fr: 'Bonjour {{recipient.name}},\n\n{{quantity}} de {{commodity}} ont été livrés. Suivez l’origine jusqu’à la parcelle sur Traceboard.\n\n{{company.signature}}' },
    },
    {
      id: 'tpl_invite_email', channel: 'EMAIL', eventKey: 'user.invited',
      subject: { en: 'You are invited to {{company.name}} on TreeSyt', fr: 'Vous êtes invité·e à rejoindre {{company.name}} sur TreeSyt' },
      body: { en: 'Hello {{recipient.name}},\n\n{{inviter.name}} invited you to join {{company.name}}. Accept within 7 days.\n\n{{company.signature}}', fr: 'Bonjour {{recipient.name}},\n\n{{inviter.name}} vous invite à rejoindre {{company.name}}. Acceptez sous 7 jours.\n\n{{company.signature}}' },
    },
    { id: 'tpl_receipt_print', channel: 'RECEIPT', eventKey: 'purchase.recorded', body: { en: 'RECEIPT {{number}}\n{{farmer.name}} · {{community}}\n{{quantity}} {{commodity}} × {{price}}\nTOTAL {{amount}}\nPaid by {{method}}', fr: 'REÇU {{number}}\n{{farmer.name}} · {{community}}\n{{quantity}} {{commodity}} × {{price}}\nTOTAL {{amount}}\nPayé par {{method}}' } },
  ];
}

function tolerances(commodities: Commodity[]) {
  return commodities.flatMap((c) => [
    { commodityId: c.id, movement: 'INBOUND' as const, pct: c.lossTolerancePct },
    { commodityId: c.id, movement: 'TRANSFER' as const, pct: c.lossTolerancePct },
    { commodityId: c.id, movement: 'STORAGE' as const, pct: Math.round(c.lossTolerancePct * 200) / 100 },
  ]);
}

const consent: Record<Lang, string> = {
  en: 'I agree that {{company.name}} records my details, photo and fingerprint to pay me and to trace my produce. I can ask for them to be removed at any time.',
  fr: 'J’accepte que {{company.name}} enregistre mes informations, ma photo et mon empreinte pour me payer et tracer ma production. Je peux demander leur suppression à tout moment.',
};

export function vitaraExtras(orgId: string, commodities: Commodity[], currency = 'GHS'): ExtraSettings {
  const m = (major: number) => toMinor(major, currency);
  const lib = formLibrary('vit', {
    farmer: 'Farmer profile', community: 'Community profile', farmerGroup: 'Farmer group profile', nursery: 'Nursery registration',
    plot: 'Plot registration', plotMonitoring: 'Plot monitoring', treeMonitoring: 'Tree monitoring visit', nurseryMonitoring: 'Nursery monitoring round',
    workshopFeedback: 'Workshop feedback', recoveryFeedback: 'Recovery feedback', agentReport: 'Agent report',
  }, { farmer: 3, community: 3, farmerGroup: 2 });
  return {
    features: Object.fromEntries(SUB_FEATURES.map((f) => [f.key, true])),
    extraCharges: [
      { id: 'xc_transport', name: 'Transport', amountMinor: m(5), payer: 'company', enabled: true },
      { id: 'xc_levy', name: 'District levy', amountMinor: m(1), payer: 'payee', enabled: false },
    ],
    pricing: { changeApproval: true, premiums: [{ id: 'pm_org', name: 'Organic', pct: 8 }, { id: 'pm_ft', name: 'Fairtrade', pct: 5 }], history: [] },
    inventoryRules: {
      tolerances: tolerances(commodities), transferBoundsPct: 1, autoWriteOff: true,
      stockCount: { frequency: 'MONTHLY', basis: 'FULL', blind: true },
      liability: { payer: 'AGENT', priceBasis: 'PURCHASE', includeLogistics: true },
    },
    support: {
      types: [
        { id: 'st_cash', name: { en: 'Cash support', fr: 'Appui en espèces' }, kind: 'CASH', subTypes: ['Farm labour', 'School fees'], groupScoring: true, recoverable: true, maxAmountMinor: m(2_000), enabled: true },
        { id: 'st_plough', name: { en: 'Ploughing', fr: 'Labour' }, kind: 'SERVICE', subTypes: ['Tractor', 'Bullock'], groupScoring: true, recoverable: true, maxAmountMinor: m(1_500), enabled: true },
        { id: 'st_input', name: { en: 'Inputs', fr: 'Intrants' }, kind: 'INPUT', subTypes: ['Seed', 'Fertiliser', 'Tarpaulin'], groupScoring: false, recoverable: true, maxAmountMinor: m(1_200), enabled: true },
        { id: 'st_agro', name: { en: 'Agroforestry', fr: 'Agroforesterie' }, kind: 'INPUT', subTypes: ['Shea seedlings', 'Mango seedlings'], groupScoring: false, recoverable: false, maxAmountMinor: 0, enabled: true },
      ],
      abilityToPay: ['Produce at harvest', 'Cash after market day', 'Mixed cash and produce'],
      recoveryWindowDays: 180, repaymentModes: ['CASH', 'PRODUCE', 'MIXED'], blockOnDebt: true, minGroupScore: 60,
    },
    fieldTeam: {
      plan: { minDays: 3, maxDays: 6, planAheadWeeks: 2 },
      reportingLevels: 3,
      costCategories: [
        { id: 'cc_fuel', name: 'Fuel', maxPerDayMinor: m(80), maxPerWeekMinor: m(400), receiptRequired: true },
        { id: 'cc_airtime', name: 'Airtime & data', maxPerDayMinor: m(10), maxPerWeekMinor: m(50), receiptRequired: false },
        { id: 'cc_perdiem', name: 'Per diem', maxPerDayMinor: m(60), maxPerWeekMinor: m(300), receiptRequired: false },
        { id: 'cc_lodging', name: 'Lodging', maxPerDayMinor: m(150), maxPerWeekMinor: m(450), receiptRequired: true },
      ],
      penaltyBands: [
        { id: 'pb_1', fromPct: 0, toPct: 50, penaltyPct: 20 },
        { id: 'pb_2', fromPct: 50, toPct: 80, penaltyPct: 10 },
        { id: 'pb_3', fromPct: 80, toPct: 100, penaltyPct: 0 },
      ],
      carryForward: true,
      allowanceTypes: [
        { id: 'al_maint', name: 'Motorbike maintenance', amountMinor: m(250), frequency: 'MONTHLY' },
        { id: 'al_airtime', name: 'Weekly airtime', amountMinor: m(20), frequency: 'WEEKLY' },
      ],
      unusedReasons: ['Community visit cancelled', 'Rain', 'Shared transport', 'Market closed'],
      issueCategories: [
        { id: 'ic_absent', name: 'Absent from planned community', consequence: 'WARNING' },
        { id: 'ic_receipt', name: 'Missing or false receipt', consequence: 'PENALTY' },
        { id: 'ic_price', name: 'Paid farmers below list price', consequence: 'SUSPENSION' },
        { id: 'ic_late', name: 'Late sync', consequence: 'NOTE' },
      ],
    },
    qualityRules: rules(),
    formLibrary: lib,
    formBindings: bindAll(lib),
    biometrics: { thumbprint: true, consentType: 'AUDIO', consentText: consent, nfcCards: true, cardKeyRotatedAt: '2026-06-01T09:00:00.000Z' },
    notificationRules: notificationRules(orgId),
    templates: templates(),
    messaging: {
      sms: [{ country: 'GH', provider: 'Hubtel', senderId: 'VITARA', enabled: true }],
      otpExpiryMinutes: 10, emailDomain: 'vitara.example', emailSender: 'noreply@vitara.example', domainVerified: true,
    },
    integrations: {
      apiKeys: [
        { id: 'key_erp', name: 'ERP sync', prefix: 'ts_live_', last4: '7Q2a', scopes: ['purchases:read', 'payments:read'], createdAt: '2026-04-11T10:00:00.000Z', createdBy: 'u_aicha', lastUsedAt: '2026-10-17T06:12:00.000Z' },
        { id: 'key_bi', name: 'Power BI export', prefix: 'ts_live_', last4: 'mK9d', scopes: ['reports:read'], createdAt: '2026-02-03T10:00:00.000Z', createdBy: 'u_aicha', revokedAt: '2026-08-20T10:00:00.000Z' },
      ],
      webhooks: [
        {
          id: 'wh_erp', event: 'payment.sent', url: 'https://erp.vitara.example/hooks/treesyt', secret: 'whsec_demo_3f9a', enabled: true,
          deliveries: [
            { id: 'whd_1', at: '2026-10-17T06:10:00.000Z', event: 'payment.sent', status: 200, ms: 182 },
            { id: 'whd_2', at: '2026-10-16T15:41:00.000Z', event: 'payment.sent', status: 200, ms: 240 },
            { id: 'whd_3', at: '2026-10-16T11:02:00.000Z', event: 'payment.sent', status: 503, ms: 3011 },
          ],
        },
      ],
      accounting: 'NONE',
    },
    privacy: { retentionDays: { syncLogs: 90, payloads: 30, audio: 365, photos: 730, activity: 2555 } },
  };
}

export function kakaoExtras(orgId: string, commodities: Commodity[]): ExtraSettings {
  const base = vitaraExtras(orgId, commodities, 'XOF');
  const m = (major: number) => toMinor(major, 'XOF');
  return {
    ...base,
    features: { ...base.features, voicePurchase: false },
    extraCharges: [{ id: 'xc_transport', name: 'Transport', amountMinor: m(500), payer: 'company', enabled: true }],
    pricing: { changeApproval: true, premiums: [{ id: 'pm_ra', name: 'Rainforest Alliance', pct: 4 }], history: [] },
    inventoryRules: { ...base.inventoryRules, transferBoundsPct: 0.5, stockCount: { frequency: 'WEEKLY', basis: 'CYCLE', blind: false }, liability: { payer: 'TRANSPORTER', priceBasis: 'LIST', includeLogistics: false } },
    support: {
      ...base.support,
      types: [
        { id: 'st_input', name: { en: 'Inputs', fr: 'Intrants' }, kind: 'INPUT', subTypes: ['Engrais', 'Produits phytosanitaires'], groupScoring: true, recoverable: true, maxAmountMinor: m(250_000), enabled: true },
        { id: 'st_cash', name: { en: 'Cash advance', fr: 'Avance en espèces' }, kind: 'CASH', subTypes: ['Main-d’œuvre'], groupScoring: true, recoverable: true, maxAmountMinor: m(150_000), enabled: true },
      ],
      abilityToPay: ['Fèves à la récolte', 'Espèces'], recoveryWindowDays: 120, repaymentModes: ['PRODUCE', 'MIXED'], minGroupScore: 50,
    },
    fieldTeam: {
      ...base.fieldTeam,
      costCategories: [
        { id: 'cc_fuel', name: 'Carburant', maxPerDayMinor: m(10_000), maxPerWeekMinor: m(50_000), receiptRequired: true },
        { id: 'cc_airtime', name: 'Crédit téléphone', maxPerDayMinor: m(1_000), maxPerWeekMinor: m(5_000), receiptRequired: false },
      ],
      allowanceTypes: [],
      carryForward: false,
    },
    biometrics: { ...base.biometrics, thumbprint: false, consentType: 'SIGNATURE' },
    messaging: { sms: [{ country: 'CI', provider: 'Orange SMS API', senderId: 'KAKAOIV', enabled: true }], otpExpiryMinutes: 5, emailDomain: 'kakao-ivoire.example', emailSender: 'ne-pas-repondre@kakao-ivoire.example', domainVerified: false },
    integrations: { apiKeys: [], webhooks: [], accounting: 'SAGE' },
    privacy: { retentionDays: { syncLogs: 60, payloads: 14, audio: 180, photos: 365, activity: 1825 } },
  };
}

/** New companies (wizard, sign-up, buyers): sensible defaults, nothing company-specific. */
export function genericExtras(orgId: string, commodities: Commodity[], currency: string): ExtraSettings {
  const base = vitaraExtras(orgId, commodities, currency);
  return {
    ...base,
    extraCharges: [],
    pricing: { changeApproval: false, premiums: [], history: [] },
    support: { ...base.support, types: base.support.types.slice(0, 1).map((s) => ({ ...s, subTypes: [] })) },
    messaging: { sms: [], otpExpiryMinutes: 10, emailDomain: '', emailSender: '', domainVerified: false },
    integrations: { apiKeys: [], webhooks: [], accounting: 'NONE' },
  };
}
