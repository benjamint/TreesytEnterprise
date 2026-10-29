import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSeed, ORG } from '@/data/seed';
import '@/stores';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { replyFeedback, setFeedbackStatus, submitFeedback, toggleVote, validateFeedback } from './feedbackService';

type Reg = { store: { setState: (s: object) => void }; seed: (s: unknown) => object };
beforeEach(() => {
  const s = buildSeed(new Date('2026-10-18T10:00:00Z'));
  for (const r of (window as unknown as { __treesytStores: Reg[] }).__treesytStores) r.store.setState({ ...r.seed(s), seeded: true });
  vi.restoreAllMocks();
});

const input = { orgId: ORG.vitara, userId: 'u_kwame', kind: 'BUG' as const, severity: 'HIGH' as const, title: 'Export fails', body: 'The CSV export on farmers does nothing.', area: 'farmers', path: '/app/farmers', device: 'web' as const, language: 'en' };
const notes = (userId: string) => useNotificationStore.getState().notifications.filter((n) => n.userId === userId);

describe('feedback', () => {
  it('validates title, description and bug severity', () => {
    expect(validateFeedback({ kind: 'BUG', title: 'ab', body: 'short' })).toEqual(['title', 'body', 'severity']);
    expect(validateFeedback({ kind: 'FEATURE', title: 'A real title', body: 'Long enough description' })).toEqual([]);
  });

  it('numbers new reports, keeps the context and tells the platform owner', () => {
    const before = notes('u_benjamin').length;
    const f = submitFeedback(input);
    expect(f.number).toBe('FB-0005');
    expect(f).toMatchObject({ status: 'NEW', votes: ['u_kwame'], area: 'farmers', context: { device: 'web', appVersion: '3.9.2' } });
    expect(useFeedbackStore.getState().items[0]!.id).toBe(f.id);
    expect(notes('u_benjamin').length).toBe(before + 1);
    expect(notes('u_benjamin')[0]).toMatchObject({ key: 'feedbackNew', link: `/app/feedback?open=${f.id}` });
  });

  it('drops severity on non-bug reports', () => {
    expect(submitFeedback({ ...input, kind: 'FEATURE' }).severity).toBeUndefined();
  });

  it('toggles votes, but the reporter cannot remove their own', () => {
    const f = submitFeedback(input);
    toggleVote(f.id, 'u_ama');
    expect(useFeedbackStore.getState().items.find((x) => x.id === f.id)!.votes).toEqual(['u_kwame', 'u_ama']);
    toggleVote(f.id, 'u_ama');
    toggleVote(f.id, 'u_kwame');
    expect(useFeedbackStore.getState().items.find((x) => x.id === f.id)!.votes).toEqual(['u_kwame']);
  });

  it('status changes and owner replies reach the reporter; reporter replies reach the owner', () => {
    const f = submitFeedback(input);
    setFeedbackStatus(f.id, 'PLANNED', 'u_benjamin');
    replyFeedback(f.id, 'u_benjamin', 'Fixed in the next release.');
    expect(notes('u_kwame').map((n) => n.key).slice(0, 2)).toEqual(['feedbackReply', 'feedbackStatus.PLANNED']);
    const ownerBefore = notes('u_benjamin').length;
    replyFeedback(f.id, 'u_kwame', 'Thank you!');
    expect(notes('u_benjamin').length).toBe(ownerBefore + 1);
    const saved = useFeedbackStore.getState().items.find((x) => x.id === f.id)!;
    expect(saved.status).toBe('PLANNED');
    expect(saved.replies.map((r) => r.userId)).toEqual(['u_benjamin', 'u_kwame']);
  });
});
