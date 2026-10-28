import type { Commodity, Lang, OrgSettings } from '@/types';
import { formBindingsFor } from '@/data/forms/library';
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
  | 'features' | 'extraCharges' | 'pricing' | 'inventoryRules' | 'sales' | 'land' | 'training' | 'support' | 'fieldTeam' | 'qualityRules'
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

/** Vitara's rules today (PRD C5); the Vitara-specific ones ship disabled with a note. */
function rules(): QualityRule[] {
  return [
    { id: 'qr_age', entity: 'farmer', field: 'age', operator: 'between', value: [18, 100], severity: 'warning', enabled: true },
    { id: 'qr_household', entity: 'farmer', field: 'customFields.householdSize', operator: 'between', value: [1, 20], severity: 'warning', enabled: true },
    { id: 'qr_phone', entity: 'farmer', field: 'phone', operator: 'unique', duplicateScope: 'company', severity: 'warning', enabled: true },
    { id: 'qr_idnumber', entity: 'farmer', field: 'customFields.idNumber', operator: 'unique', duplicateScope: 'company', severity: 'warning', enabled: true },
    { id: 'qr_consent', entity: 'farmer', field: 'identity.consent', operator: 'notEmpty', severity: 'warning', enabled: true },
    { id: 'qr_children', entity: 'farmer', field: 'customFields.numberOfChildren', operator: 'lessThanField', crossField: 'customFields.householdSize', severity: 'info', enabled: true },
    { id: 'qr_name', entity: 'farmer', field: 'firstName', operator: 'notEmpty', severity: 'block', enabled: true },
    { id: 'qr_lang_ewe', entity: 'farmer', field: 'customFields.language', operator: 'notEquals', value: 'ewe', severity: 'info', enabled: false, note: 'Vitara-specific: Ewe speakers were outside the 2024 catchment.' },
    { id: 'qr_edu_tertiary', entity: 'farmer', field: 'customFields.educationLevel', operator: 'notEquals', value: 'tertiary', severity: 'info', enabled: false, note: 'Vitara-specific: tertiary education was checked by hand.' },
    { id: 'qr_asset_tractor', entity: 'farmer', field: 'customFields.assets', operator: 'notContains', value: 'tractor', severity: 'info', enabled: false, note: 'Vitara-specific: tractor owners are not smallholders.' },
    { id: 'qr_pop', entity: 'community', field: 'population', operator: 'between', value: [20, 20000], severity: 'info', enabled: true },
    { id: 'qr_contact', entity: 'community', field: 'contactPerson.phone', operator: 'notEmpty', severity: 'warning', enabled: true },
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
      expenseTypes: [
        { id: 'wx_in', name: { en: 'Inbound handling', fr: 'Manutention à l’entrée' }, basis: 'PER_BAG', defaultRateMinor: m(1.5) },
        { id: 'wx_out', name: { en: 'Outbound handling', fr: 'Manutention à la sortie' }, basis: 'PER_BAG', defaultRateMinor: m(1.5) },
        { id: 'wx_maint', name: { en: 'Maintenance', fr: 'Entretien' }, basis: 'FLAT', defaultRateMinor: m(400) },
      ],
    },
    support: {
      types: [
        { id: 'st_cash', code: 'CPF', name: { en: 'Cash pre-finance', fr: 'Préfinancement en espèces' }, kind: 'CASH', unit: 'MONEY', subTypes: ['Farm labour', 'School fees', 'Household'], groupScoring: true, recoverable: true, maxAmountMinor: m(2_000), enabled: true, needsProvider: false, payout: 'GROUP_WALLET', evidence: { leaderVoice: true, witnessVoice: true, agreement: true, thumbprints: true, photo: false } },
        { id: 'st_plough', code: 'PLG', name: { en: 'Ploughing', fr: 'Labour' }, kind: 'SERVICE', unit: 'ACRES', subTypes: ['Tractor', 'Bullock'], groupScoring: true, recoverable: true, maxAmountMinor: m(1_500), enabled: true, needsProvider: true, payout: 'SUPPLIER', evidence: { leaderVoice: true, witnessVoice: false, agreement: true, thumbprints: true, photo: true } },
        { id: 'st_input', code: 'INP', name: { en: 'Farm input', fr: 'Intrants agricoles' }, kind: 'INPUT', unit: 'BAGS', subTypes: ['Fertilizer', 'Agrochemical', 'Sack', 'Seed', 'Tool/Machine', 'Planter', 'Harvester', 'Others'], groupScoring: false, recoverable: true, maxAmountMinor: m(1_200), enabled: true, needsProvider: true, payout: 'SUPPLIER', evidence: { leaderVoice: true, witnessVoice: false, agreement: true, thumbprints: true, photo: true } },
        { id: 'st_agro', code: 'AGF', name: { en: 'Agroforestry', fr: 'Agroforesterie' }, kind: 'INPUT', unit: 'MONEY', subTypes: ['Nursery', 'Tree planting', 'Parkland'], groupScoring: false, recoverable: false, maxAmountMinor: m(800), enabled: true, needsProvider: false, payout: 'IN_KIND', evidence: { leaderVoice: false, witnessVoice: false, agreement: false, thumbprints: false, photo: true } },
      ],
      abilityToPay: ['Produce at harvest', 'Cash after market day', 'Mixed cash and produce'],
      recoveryWindowDays: 180, repaymentModes: ['CASH', 'PRODUCE', 'MIXED'], blockOnDebt: true, minGroupScore: 60, linkPurchaseRequest: true,
      feedback: { experience: ['Excellent', 'Very good', 'Good', 'Bad', 'Very bad'], lendAgain: true },
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
    formBindings: formBindingsFor(orgId),
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
    sales: {
      // Vitara's payment terms and packaging catalogue today (PRD H7).
      paymentTerms: [
        { id: 'pt_after', name: { en: '100% after delivery', fr: '100 % après livraison' }, instalments: [{ pct: 100, trigger: 'AFTER_DELIVERY', days: 30 }] },
        { id: 'pt_on', name: { en: '100% on delivery', fr: '100 % à la livraison' }, instalments: [{ pct: 100, trigger: 'DELIVERY', days: 0 }] },
        { id: 'pt_5050', name: { en: '50% advance, 50% on delivery', fr: '50 % d’avance, 50 % à la livraison' }, instalments: [{ pct: 50, trigger: 'SIGNATURE', days: 7 }, { pct: 50, trigger: 'DELIVERY', days: 0 }] },
        { id: 'pt_3070', name: { en: '30% advance, 70% after delivery', fr: '30 % d’avance, 70 % après livraison' }, instalments: [{ pct: 30, trigger: 'SIGNATURE', days: 7 }, { pct: 70, trigger: 'AFTER_DELIVERY', days: 14 }] },
      ],
      packaging: [{ id: 'pk_pp', name: { en: 'PP sacks', fr: 'Sacs PP' } }, { id: 'pk_jute', name: { en: 'Jute sacks', fr: 'Sacs de jute' } }, { id: 'pk_box', name: { en: 'Boxes', fr: 'Cartons' } }],
      templates: commodities.slice(0, 2).map((c, i) => ({
        id: `ct_${c.id}`, name: `${c.name.en ?? c.code} — export`, commodityId: c.id, unitId: 't', paymentTermId: i ? 'pt_3070' : 'pt_5050', packagingId: i ? 'pk_pp' : 'pk_jute', tolerancePct: 2,
        deliveryPoint: 'Tema Port', clauses: 'Seller delivers the goods to the delivery point within the shipment window. Weights are as per the buyer’s weighbridge. Quality as per the specification; rejected lots are replaced at the seller’s cost.',
      })),
      impactKpis: ['womenShare', 'childrenPerFarmer', 'treesPlanted', 'plotsMapped', 'eudr'],
      certifications: ['EU Organic', 'Fair for Life'],
      overdueAlertDays: 14,
    },
    land: vitaraLand(),
    training: { editHeldDays: 3, deletePlannedOnly: true, membersOnly: true, allowGuests: true, minForCommission: 15, maxForCommission: 60, ratingRequired: true },
  };
}

const L = (en: string, fr: string) => ({ en, fr });
const Q = (id: string, en: string, fr: string, kind: 'YES_NO' | 'TEXT', plotTypeIds: string[]) => ({ id, label: L(en, fr), kind, plotTypeIds });

/** Vitara today: shea parkland trees and fruit trees, raised in community nurseries (PRD I1–I4). */
function vitaraLand(): OrgSettings['land'] {
  const all = ['pt_farm', 'pt_park', 'pt_conc', 'pt_block'];
  return {
    species: [
      { id: 'sp_sheag', name: L('Shea (grafted)', 'Karité (greffé)'), codePrefix: 'SHG', type: 'SHEA_GRAFTED', densityPerHa: { pt_farm: 40, pt_park: 25, pt_conc: 100, pt_block: 156 }, co2KgPerYear: 12, enabled: true },
      { id: 'sp_sheau', name: L('Shea (ungrafted)', 'Karité (non greffé)'), codePrefix: 'SHU', type: 'SHEA_UNGRAFTED', densityPerHa: { pt_farm: 30, pt_park: 20, pt_conc: 80, pt_block: 120 }, co2KgPerYear: 14, enabled: true },
      { id: 'sp_dawa', name: L('Dawadawa', 'Néré'), codePrefix: 'DWD', type: 'TIMBER', densityPerHa: { pt_farm: 20, pt_park: 15, pt_conc: 60, pt_block: 100 }, co2KgPerYear: 18, enabled: true },
      { id: 'sp_mango', name: L('Mango', 'Manguier'), codePrefix: 'MGO', type: 'FRUIT', densityPerHa: { pt_farm: 50, pt_park: 20, pt_conc: 100, pt_block: 100 }, co2KgPerYear: 22, enabled: true },
      { id: 'sp_cashew', name: L('Cashew', 'Anacardier'), codePrefix: 'CSH', type: 'FRUIT', densityPerHa: { pt_farm: 60, pt_park: 25, pt_conc: 100, pt_block: 100 }, co2KgPerYear: 16, enabled: true },
      { id: 'sp_moringa', name: L('Moringa', 'Moringa'), codePrefix: 'MOR', type: 'MEDICINAL', densityPerHa: { pt_farm: 200, pt_park: 50, pt_conc: 400, pt_block: 400 }, co2KgPerYear: 6, enabled: true },
    ],
    nurseryRounds: [
      { id: 'nr_primary', name: L('Primary', 'Principale'), kind: 'PRIMARY', dueDays: 21, fields: ['polyBags', 'potted', 'germinated'] },
      { id: 'nr_sec', name: L('Secondary', 'Secondaire'), kind: 'SECONDARY', dueDays: 45, fields: ['alive', 'dead', 'newGerminations'] },
      { id: 'nr_sec2', name: L('Secondary', 'Secondaire'), kind: 'SECONDARY', dueDays: 75, fields: ['alive', 'dead', 'newGerminations'] },
      { id: 'nr_sec3', name: L('Secondary', 'Secondaire'), kind: 'SECONDARY', dueDays: 105, fields: ['alive', 'dead', 'newGerminations'] },
    ],
    treeRoundDays: [30, 90, 180, 365],
    maxSeedlingsPerFarmer: 20,
    plotTypes: [
      { id: 'pt_farm', name: L('Farmland', 'Terre agricole'), requiresFarmer: true },
      { id: 'pt_park', name: L('Community parkland', 'Parc communautaire'), requiresFarmer: false },
      { id: 'pt_conc', name: L('Concession', 'Concession'), requiresFarmer: false },
      { id: 'pt_block', name: L('Block', 'Bloc'), requiresFarmer: false },
    ],
    plotMonitoring: [
      Q('chemicals', 'Chemical additives used', 'Produits chimiques utilisés', 'YES_NO', all),
      Q('treeCutting', 'Trees cut on the plot', 'Arbres abattus sur la parcelle', 'YES_NO', all),
      Q('farmingActivities', 'Farming activities seen', 'Activités agricoles observées', 'TEXT', ['pt_farm', 'pt_park']),
      Q('livestockPresent', 'Livestock present', 'Bétail présent', 'YES_NO', all),
      Q('livestockPast', 'Livestock in the past month', 'Bétail le mois dernier', 'YES_NO', all),
      Q('fenced', 'Plot fenced', 'Parcelle clôturée', 'YES_NO', all),
      Q('bushfire', 'Bushfire this season', 'Feu de brousse cette saison', 'YES_NO', all),
      Q('recentBushfire', 'Bushfire in the last 30 days', 'Feu de brousse ces 30 derniers jours', 'YES_NO', all),
      Q('fireProtection', 'Fire protection measures', 'Mesures de protection contre le feu', 'TEXT', all),
    ],
    plotMonitoringDays: 90,
    eudr: { cutoffDate: '2020-12-31', polygonOverHa: 4, minDecimals: 6, operator: { name: 'Vitara Shea Ltd', eori: 'GH-OP-20418', address: 'Plot 14, Wa Road, Tamale, Ghana' } },
    exportMaxDays: 366,
  };
}

/** Kakao Ivoire: cocoa plots with shade trees (EUDR-relevant). */
function kakaoLand(): OrgSettings['land'] {
  const all = ['pt_cocoa', 'pt_fallow', 'pt_block'];
  return {
    species: [
      { id: 'sp_frake', name: L('Frake', 'Fraké'), codePrefix: 'FRK', type: 'TIMBER', densityPerHa: { pt_cocoa: 18, pt_fallow: 60, pt_block: 100 }, co2KgPerYear: 25, enabled: true },
      { id: 'sp_akpi', name: L('Akpi', 'Akpi'), codePrefix: 'AKP', type: 'SHADE', densityPerHa: { pt_cocoa: 12, pt_fallow: 40, pt_block: 80 }, co2KgPerYear: 20, enabled: true },
      { id: 'sp_orange', name: L('Orange', 'Oranger'), codePrefix: 'ORA', type: 'FRUIT', densityPerHa: { pt_cocoa: 10, pt_fallow: 30, pt_block: 100 }, co2KgPerYear: 9, enabled: true },
      { id: 'sp_avocado', name: L('Avocado', 'Avocatier'), codePrefix: 'AVO', type: 'FRUIT', densityPerHa: { pt_cocoa: 10, pt_fallow: 30, pt_block: 100 }, co2KgPerYear: 11, enabled: true },
    ],
    nurseryRounds: [
      { id: 'nr_primary', name: L('Primary', 'Principale'), kind: 'PRIMARY', dueDays: 30, fields: ['polyBags', 'potted', 'germinated'] },
      { id: 'nr_sec', name: L('Secondary', 'Secondaire'), kind: 'SECONDARY', dueDays: 60, fields: ['alive', 'dead'] },
    ],
    treeRoundDays: [90, 365],
    maxSeedlingsPerFarmer: 30,
    plotTypes: [
      { id: 'pt_cocoa', name: L('Cocoa plot', 'Parcelle de cacao'), requiresFarmer: true },
      { id: 'pt_fallow', name: L('Fallow', 'Jachère'), requiresFarmer: true },
      { id: 'pt_block', name: L('Block', 'Bloc'), requiresFarmer: false },
    ],
    plotMonitoring: [
      Q('chemicals', 'Chemical additives used', 'Produits chimiques utilisés', 'YES_NO', all),
      Q('treeCutting', 'Trees cut on the plot', 'Arbres abattus sur la parcelle', 'YES_NO', all),
      Q('fireProtection', 'Fire protection measures', 'Mesures de protection contre le feu', 'TEXT', all),
    ],
    plotMonitoringDays: 180,
    eudr: { cutoffDate: '2020-12-31', polygonOverHa: 4, minDecimals: 6, operator: { name: 'Union des Coopératives Kakao Ivoire SCOOPS', eori: 'CI-OP-55210', address: 'Quartier Commerce, Soubré, Côte d’Ivoire' } },
    exportMaxDays: 366,
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
    inventoryRules: { ...base.inventoryRules, expenseTypes: [{ id: 'wx_in', name: { en: 'Inbound handling', fr: 'Manutention entrée' }, basis: 'PER_BAG', defaultRateMinor: m(250) }, { id: 'wx_fumig', name: { en: 'Fumigation', fr: 'Fumigation' }, basis: 'PER_KG', defaultRateMinor: m(2) }, { id: 'wx_maint', name: { en: 'Maintenance', fr: 'Entretien' }, basis: 'FLAT', defaultRateMinor: m(75_000) }], transferBoundsPct: 0.5, stockCount: { frequency: 'WEEKLY', basis: 'CYCLE', blind: false }, liability: { payer: 'TRANSPORTER', priceBasis: 'LIST', includeLogistics: false } },
    support: {
      ...base.support,
      types: [
        { id: 'st_input', code: 'INT', name: { en: 'Inputs', fr: 'Intrants' }, kind: 'INPUT', unit: 'BAGS', subTypes: ['Engrais', 'Produits phytosanitaires'], groupScoring: true, recoverable: true, maxAmountMinor: m(250_000), enabled: true, needsProvider: true, payout: 'SUPPLIER', evidence: { leaderVoice: true, witnessVoice: true, agreement: true, thumbprints: true, photo: false } },
        { id: 'st_cash', code: 'AVE', name: { en: 'Cash advance', fr: 'Avance en espèces' }, kind: 'CASH', unit: 'MONEY', subTypes: ['Main-d’œuvre'], groupScoring: true, recoverable: true, maxAmountMinor: m(150_000), enabled: true, needsProvider: false, payout: 'GROUP_WALLET', evidence: { leaderVoice: true, witnessVoice: true, agreement: true, thumbprints: true, photo: false } },
      ],
      abilityToPay: ['Fèves à la récolte', 'Espèces'], recoveryWindowDays: 120, repaymentModes: ['PRODUCE', 'MIXED'], minGroupScore: 50, linkPurchaseRequest: true,
      feedback: { experience: ['Excellente', 'Très bonne', 'Bonne', 'Mauvaise', 'Très mauvaise'], lendAgain: true },
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
    sales: { ...base.sales, templates: base.sales.templates.map((x) => ({ ...x, deliveryPoint: 'Port de San-Pédro', clauses: 'Le vendeur livre la marchandise au point de livraison pendant la période d’expédition. Les poids sont ceux du pont-bascule de l’acheteur.' })), impactKpis: ['womenShare', 'childrenPerFarmer', 'plotsMapped', 'eudr'], certifications: ['Rainforest Alliance', 'Fairtrade'] },
    land: kakaoLand(),
    training: { editHeldDays: 0, deletePlannedOnly: true, membersOnly: false, allowGuests: true, minForCommission: 10, maxForCommission: 80, ratingRequired: false },
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
    land: { ...base.land, species: base.land.species.slice(0, 2), nurseryRounds: base.land.nurseryRounds.slice(0, 2), eudr: { ...base.land.eudr, operator: { name: '', eori: '', address: '' } } },
  };
}
