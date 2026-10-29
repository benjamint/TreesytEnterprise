import type { Feedback } from '@/types';
import { defineStore } from './persistence';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ctx = (device: 'web' | 'mobile', language = 'en') => ({ device, language, appVersion: '3.9.2', viewport: device === 'web' ? '1440×900' : '390×844' });

/** A few requests so the page has something to show (invented people and wording). */
function sample(): Feedback[] {
  return [
    { id: 'fb_1', number: 'FB-0001', orgId: 'org_vitara', userId: 'u_ama', kind: 'FEATURE', title: 'Export the stock table to Excel', body: 'Our buyers ask for a weekly stock sheet per warehouse. A one-click Excel export from Warehouses would save us retyping it.', area: 'warehouses', path: '/app/warehouses', status: 'PLANNED', votes: ['u_ama', 'u_kwame'], replies: [{ id: 'fbr_1', userId: 'u_benjamin', text: 'Thanks Ama, this is planned for the next release. We will include bags and ageing per commodity.', at: ago(3) }], context: ctx('web'), createdAt: ago(9), updatedAt: ago(3) },
    { id: 'fb_2', number: 'FB-0002', orgId: 'org_vitara', userId: 'u_yaw', kind: 'BUG', severity: 'MEDIUM', title: 'Sync stops when the phone goes offline mid-upload', body: 'When I lose network while syncing a purchase with photos, the sync bar stays on "Uploading" until I restart the app.', area: 'sync', path: '/m/sync', status: 'IN_PROGRESS', votes: ['u_yaw', 'u_mariama'], replies: [], context: ctx('mobile'), createdAt: ago(5), updatedAt: ago(2) },
    { id: 'fb_3', number: 'FB-0003', orgId: 'org_vitara', userId: 'u_kwame', kind: 'IMPROVEMENT', title: 'Show the price list next to the requested price', body: 'When approving purchase requests it would help to see the list price on the same line, not only in the drawer.', area: 'purchaseRequests', path: '/app/purchase-requests', status: 'NEW', votes: ['u_kwame'], replies: [], context: ctx('web'), createdAt: ago(1), updatedAt: ago(1) },
    { id: 'fb_4', number: 'FB-0004', orgId: 'org_kakao', userId: 'u_aicha', kind: 'FEATURE', title: 'Rapport EUDR par coopérative', body: 'Nous aimerions générer la déclaration de diligence raisonnable par coopérative et non seulement par lot.', area: 'eudr', path: '/app/eudr', status: 'UNDER_REVIEW', votes: ['u_aicha'], replies: [], context: ctx('web', 'fr'), createdAt: ago(4), updatedAt: ago(4) },
  ];
}

/** Bug reports and product requests sent from the app. */
export const useFeedbackStore = defineStore('feedback', { items: [] as Feedback[] }, () => ({ items: sample() }), (set) => ({
  add: (f: Feedback) => set((st) => ({ items: [f, ...st.items] })),
  update: (id: string, patch: Partial<Feedback>) => set((st) => ({ items: st.items.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) })),
}));
