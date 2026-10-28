import type { GPS, OrgEntity } from './core';

/** Training catalogue, workshops and attendance (PRD G3, M10). */

export type TopicCategory = 'AGRONOMY' | 'CONSERVATION' | 'FINANCE' | 'SAFETY' | 'QUALITY' | 'SOCIAL';
export type TopicAudience = 'FARMERS' | 'GROUPS' | 'STAFF';

export interface TrainingTopic extends OrgEntity {
  name: Partial<Record<'en' | 'fr', string>>;
  category: TopicCategory;
  durationMin: number;
  materials: string[];
  /** Optional quiz (a survey form) run after the session. */
  quizFormId?: string;
  audience: TopicAudience;
  active: boolean;
}

export type AttendanceMethod = 'NFC' | 'QR' | 'THUMBPRINT' | 'MANUAL';

export interface Attendance {
  id: string;
  /** A registered farmer, or a guest (when guests are allowed). */
  farmerId?: string;
  guestName?: string;
  method: AttendanceMethod;
  rating?: number;
  comment?: string;
  at: string;
}

export type WorkshopStatus = 'PLANNED' | 'HELD' | 'CANCELLED' | 'ARCHIVED';

export interface Workshop extends OrgEntity {
  number: string;
  topicId: string;
  title: string;
  date: string;
  location: string;
  communityId: string;
  groupId?: string;
  /** Facilitator. */
  agentId: string;
  expected: number;
  status: WorkshopStatus;
  attendance: Attendance[];
  images: { id: string; name: string; at: string; by: string }[];
  /** Feedback form responses collected at the end. */
  feedbackResponseIds: string[];
  startedAt?: string;
  heldAt?: string;
  gps?: GPS;
  cancelled?: { at: string; by: string; reason: string };
  archived?: { at: string; by: string; remarks: string };
  device?: 'web' | 'mobile';
}
