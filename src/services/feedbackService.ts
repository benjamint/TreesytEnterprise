import type { Feedback, FeedbackKind, FeedbackSeverity, FeedbackStatus } from '@/types';
import { makeEvent } from '@/engines/activity';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useNotificationStore } from '@/stores/notificationStore';

export const APP_VERSION = '3.9.2';
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'];
export const OPEN_STATUSES = new Set<FeedbackStatus>(['NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS']);

const now = () => new Date().toISOString();

/** Platform owners triage feedback from every company. */
export function feedbackOwners() {
  return useAccessStore.getState().users.filter((u) => u.isPlatformOwner);
}

function notify(orgId: string, userId: string, key: string, params: Record<string, unknown>, id: string) {
  useNotificationStore.getState().push({ id: uid('ntf'), orgId, userId, kind: 'ALERT', key, params, link: `/app/feedback?open=${id}`, read: false, at: now() });
}

/** Owners get the notice in their home company (their first membership), where the platform console lives. */
const homeOrg = (userId: string) => useAccessStore.getState().memberships.find((m) => m.userId === userId)?.orgId ?? 'org_treesyt';
const notifyOwners = (key: string, f: Feedback, except?: string) => {
  for (const o of feedbackOwners()) if (o.id !== except) notify(homeOrg(o.id), o.id, key, { number: f.number, title: f.title }, f.id);
};

function nextNumber() {
  const n = useFeedbackStore.getState().items.reduce((m, f) => Math.max(m, Number(f.number.replace(/\D/g, '')) || 0), 0) + 1;
  return `FB-${String(n).padStart(4, '0')}`;
}

export interface FeedbackInput {
  orgId: string;
  userId: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  severity?: FeedbackSeverity;
  area?: string;
  path?: string;
  screenshot?: string;
  device: 'web' | 'mobile';
  language: string;
  viewport?: string;
  theme?: string;
}

export function validateFeedback(i: Pick<FeedbackInput, 'title' | 'body' | 'kind' | 'severity'>): string[] {
  const errors: string[] = [];
  if (i.title.trim().length < 4) errors.push('title');
  if (i.body.trim().length < 10) errors.push('body');
  if (i.kind === 'BUG' && !i.severity) errors.push('severity');
  return errors;
}

/** Saves a report, notifies the platform owners, and records it on the reporter's activity. */
export function submitFeedback(i: FeedbackInput): Feedback {
  const at = now();
  const f: Feedback = {
    id: uid('fb'), number: nextNumber(), orgId: i.orgId, userId: i.userId, kind: i.kind, title: i.title.trim(), body: i.body.trim(),
    severity: i.kind === 'BUG' ? i.severity : undefined, area: i.area, path: i.path, status: 'NEW', votes: [i.userId], replies: [], screenshot: i.screenshot,
    context: { device: i.device, language: i.language, viewport: i.viewport, theme: i.theme, appVersion: APP_VERSION }, createdAt: at, updatedAt: at,
  };
  useFeedbackStore.getState().add(f);
  useActivityStore.getState().log(makeEvent(i.orgId, 'feedback', f.id, 'feedback.sent', { number: f.number }, i.userId, { device: i.device }));
  notifyOwners('feedbackNew', f, i.userId);
  return f;
}

/** "Me too": adds or removes the person's vote (the reporter's own vote stays). */
export function toggleVote(id: string, userId: string) {
  const f = useFeedbackStore.getState().items.find((x) => x.id === id);
  if (!f || f.userId === userId) return;
  const votes = f.votes.includes(userId) ? f.votes.filter((v) => v !== userId) : [...f.votes, userId];
  useFeedbackStore.getState().update(id, { votes });
}

/** Platform owner moves a request along; the reporter is told. */
export function setFeedbackStatus(id: string, status: FeedbackStatus, by: string) {
  const f = useFeedbackStore.getState().items.find((x) => x.id === id);
  if (!f || f.status === status) return;
  useFeedbackStore.getState().update(id, { status });
  useActivityStore.getState().log(makeEvent(f.orgId, 'feedback', id, `feedback.status.${status}`, { number: f.number }, by));
  if (f.userId !== by) notify(f.orgId, f.userId, `feedbackStatus.${status}`, { number: f.number, title: f.title }, id);
}

/** A reply on the thread: owners' replies reach the reporter; the reporter's reach the owners. */
export function replyFeedback(id: string, userId: string, text: string) {
  const f = useFeedbackStore.getState().items.find((x) => x.id === id);
  if (!f || !text.trim()) return;
  useFeedbackStore.getState().update(id, { replies: [...f.replies, { id: uid('fbr'), userId, text: text.trim(), at: now() }] });
  if (userId !== f.userId) notify(f.orgId, f.userId, 'feedbackReply', { number: f.number, title: f.title }, id);
  else notifyOwners('feedbackReply', f, userId);
}
