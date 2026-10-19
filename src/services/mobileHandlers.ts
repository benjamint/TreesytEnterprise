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
