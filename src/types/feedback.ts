export type FeedbackKind = 'BUG' | 'FEATURE' | 'IMPROVEMENT';
export type FeedbackSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING';
export type FeedbackStatus = 'NEW' | 'UNDER_REVIEW' | 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'DECLINED';

export interface FeedbackReply {
  id: string;
  userId: string;
  text: string;
  at: string;
}

/** A bug report or product request sent from inside the app (web or phone). */
export interface Feedback {
  id: string;
  number: string;
  orgId: string;
  userId: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  severity?: FeedbackSeverity;
  /** Page the person was on (route key and path), captured automatically. */
  area?: string;
  path?: string;
  status: FeedbackStatus;
  /** People who added their vote ("me too"); the reporter counts as the first. */
  votes: string[];
  replies: FeedbackReply[];
  /** A screenshot the person attached (data URL, kept small). */
  screenshot?: string;
  context: { device: 'web' | 'mobile'; language: string; viewport?: string; theme?: string; appVersion: string };
  createdAt: string;
  updatedAt: string;
}
