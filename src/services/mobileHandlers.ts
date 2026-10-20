import type { Purchase, SurveyResponse } from '@/types';
import { renderMessage } from '@/engines/templates';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { sendSms } from './smsGateway';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormStore } from '@/stores/formStore';
import { confirmFundsReceived, createPre, createRequest, recordPurchases, signReceipt, type NewPre, type NewPurchase, type NewRequest } from './buyingService';
import { registerFarmer, type FarmerCore } from './farmerService';
import { fillSchema, getLiveForm, submitResponse } from './formService';
import { registerSyncHandler } from './mobileSync';
import { saveCommunity, saveFarmerEdit, saveGroup, saveIdentity, type CommunityPayload, type FarmerEditPayload, type GroupPayload } from './profileService';
import { applyFix } from './qualityService';
import type { FarmerIdentity } from '@/types';
import { confirmRecipients, createSupportRequest, recordFulfilment, saveAssets, type Confirmation, type NewSupportRequest } from './supportService';
import { createTransfer, createWarehouseExpense, receiveInbound, receiveTopUp, resolveDiscrepancy, submitAgentRepayment, submitCount, type NewWarehouseExpense, type ReceiveInput, type TransferInput } from './inventoryService';
import { createRecoveryRequest, recordRepayment, saveFeedback, type RepaymentInput } from './recoveryService';

/** How each kind of phone save is written to the shared stores (now when online, or on Sync). */

registerSyncHandler('qualityFix', {
  apply: (i) => { const p = i.payload as { taskId: string; values: Record<string, unknown> }; applyFix(p.taskId, p.values, i.userId, 'mobile'); },
});

registerSyncHandler('survey', {
  apply: (i) => {
    const p = i.payload as { formId: string; answers: Record<string, unknown>; subject?: SurveyResponse['subject']; gps?: SurveyResponse['gps']; startedAt?: string; agentId?: string };
    const form = useFormStore.getState().forms.find((f) => f.id === p.formId);
    if (!form) throw new Error('Form no longer exists');
    return submitResponse({ form, schema: fillSchema(form, useFormStore.getState().optionLists), answers: p.answers, userId: i.userId, agentId: p.agentId, subject: p.subject, gps: p.gps, startedAt: p.startedAt, device: 'mobile' });
  },
});

registerSyncHandler('farmer', {
  apply: (i) => {
    const p = i.payload as { core: FarmerCore; answers: Record<string, unknown>; agentId?: string; identity?: Partial<FarmerIdentity> };
    const res = registerFarmer(i.orgId, i.userId, p.core, getLiveForm(i.orgId, 'farmerProfile'), p.answers, { agentId: p.agentId });
    if (p.identity) saveIdentity(res.farmer.id, p.identity, i.userId);
    return res;
  },
});

registerSyncHandler('farmerEdit', {
  apply: (i) => saveFarmerEdit(i.orgId, i.userId, i.payload as FarmerEditPayload),
  serverVersion: (i) => useFarmerStore.getState().farmers.find((f) => f.id === i.base?.id)?.updatedAt,
});

registerSyncHandler('community', {
  apply: (i) => saveCommunity(i.orgId, i.userId, i.payload as CommunityPayload, getLiveForm(i.orgId, 'communityProfile')),
  serverVersion: (i) => useCommunityStore.getState().communities.find((c) => c.id === i.base?.id)?.updatedAt,
});

registerSyncHandler('group', { apply: (i) => saveGroup(i.orgId, i.userId, i.payload as GroupPayload) });

registerSyncHandler('purchaseRequest', { apply: (i) => createRequest({ ...(i.payload as NewRequest), device: 'mobile' }) });
registerSyncHandler('fundsReceived', { apply: (i) => confirmFundsReceived((i.payload as { requestId: string }).requestId, i.userId, 'mobile') });
registerSyncHandler('receipt', { apply: (i) => { const p = i.payload as { requestId: string; signature: string }; signReceipt(p.requestId, p.signature, i.userId); } });
registerSyncHandler('purchase', {
  apply: (i) => {
    const p = i.payload as { requestId: string; items: NewPurchase[] };
    const res = recordPurchases(p.requestId, p.items, i.userId, 'MOBILE');
    smsReceipts(i.orgId, res.purchases);
    return res;
  },
});

/** The farmer's SMS receipt for each purchase, when the company's notification rule is on (PRD 8.11). */
function smsReceipts(orgId: string, purchases: Purchase[]) {
  const settings = useSettingsStore.getState().settings[orgId];
  const org = usePlatformStore.getState().orgs.find((o) => o.id === orgId);
  const rule = settings?.notificationRules.find((r) => r.eventKey === 'purchase.recorded' && r.enabled && r.channels.includes('SMS'));
  const tpl = settings?.templates.find((x) => x.id === rule?.templateId);
  if (!settings || !org || !tpl) return;
  const lang = org.language === 'fr' ? 'fr' : 'en';
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const money = (m: Purchase['amount']) => new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(m.amountMinor / (m.currency === 'XOF' ? 1 : 100));
  for (const pu of purchases) {
    const farmer = useFarmerStore.getState().farmers.find((x) => x.id === pu.farmerId);
    if (!farmer?.phone) continue;
    const commodity = settings.commodities.find((c) => c.id === pu.commodityId);
    const { body } = renderMessage(tpl, lang, {
      company: { name: org.name }, number: pu.number, quantity: `${pu.quantity} kg`, commodity: commodity?.name[lang] ?? commodity?.name.en ?? '',
      price: `${money(pu.unitPrice)}/kg`, amount: money(pu.amount), farmer: { name: `${farmer.firstName} ${farmer.lastName}` },
    });
    sendSms({ orgId, to: farmer.phone, templateId: tpl.id, language: lang, body });
  }
}
registerSyncHandler('expense', { apply: (i) => createPre({ ...(i.payload as NewPre), device: 'mobile' }) });

registerSyncHandler('supportRequest', { apply: (i) => createSupportRequest({ ...(i.payload as NewSupportRequest), device: 'mobile' }) });
registerSyncHandler('supportConfirm', { apply: (i) => { const p = i.payload as { requestId: string } & Confirmation; confirmRecipients(p.requestId, p, i.userId, 'mobile'); } });
registerSyncHandler('supportFulfil', {
  apply: (i) => { const p = i.payload as { requestId: string; lineId: string; audioSeconds: number; gps?: { lat: number; lng: number; accuracy: number } }; recordFulfilment(p.requestId, p.lineId, { audioSeconds: p.audioSeconds, gps: p.gps }, i.userId, 'mobile'); },
});
registerSyncHandler('supportAssets', { apply: (i) => { const p = i.payload as { requestId: string; agreement?: string; thumbprints?: number }; saveAssets(p.requestId, p, i.userId, 'mobile'); } });
registerSyncHandler('recoveryRequest', { apply: (i) => createRecoveryRequest({ ...(i.payload as Parameters<typeof createRecoveryRequest>[0]), device: 'mobile' }) });
registerSyncHandler('repayment', { apply: (i) => recordRepayment({ ...(i.payload as RepaymentInput), actorId: i.userId, device: 'mobile' }) });
registerSyncHandler('recoveryFeedback', {
  apply: (i) => { const p = i.payload as { id: string; experience: string; lendAgain: 'YES' | 'MAYBE' | 'NO'; comment?: string }; saveFeedback(p.id, p, i.userId, 'mobile'); },
});

registerSyncHandler('inboundReceive', { apply: (i) => { const p = i.payload as { inboundId: string } & ReceiveInput; return receiveInbound(p.inboundId, { ...p, actorId: i.userId, device: 'mobile' }); } });
registerSyncHandler('transfer', { apply: (i) => createTransfer({ ...(i.payload as TransferInput), actorId: i.userId, device: 'mobile' }) });
registerSyncHandler('stockCount', { apply: (i) => { const p = i.payload as { countId: string; codes: string[]; weighed?: Record<string, number>; photos?: string[] }; return submitCount(p.countId, p, i.userId, 'mobile'); } });
registerSyncHandler('warehouseExpense', { apply: (i) => createWarehouseExpense({ ...(i.payload as NewWarehouseExpense), actorId: i.userId, device: 'mobile' }) });
registerSyncHandler('discrepancyResolve', {
  apply: (i) => { const p = i.payload as { id: string; type: 'BAG_RETURNED' | 'TAG_REPLACED' | 'WRITTEN_OFF'; newCode?: string; kg?: number; note?: string }; resolveDiscrepancy(p.id, p, i.userId, 'mobile'); },
});
registerSyncHandler('topUp', { apply: (i) => { const p = i.payload as { inboundId: string; code: string; kg: number }; return receiveTopUp(p.inboundId, p.code, p.kg, i.userId, 'mobile'); } });
registerSyncHandler('agentRepayment', {
  apply: (i) => { const p = i.payload as { inboundId: string; amountMinor: number; method: 'MOMO' | 'CASH' | 'BANK'; reference?: string; proof?: string }; return submitAgentRepayment(p.inboundId, p, i.userId, 'mobile'); },
});
