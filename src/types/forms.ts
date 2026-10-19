import type { FormBinding, FormSchema, Option } from '@/engines/forms';

export type { FormSchema, Option, Question, FormSection, QuestionType, LogicGroup, Condition } from '@/engines/forms';

export type FormStatus = FormSchema['status'];

/** A published version; records and responses keep the version they were captured with. */
export interface FormVersion {
  version: number;
  publishedAt: string;
  publishedBy: string;
  note?: string;
  schema: FormSchema;
}

/** Who fills a form on mobile (PRD G1 Assignment). */
export interface FormAssignment {
  mode: 'all' | 'roles' | 'agentTypes' | 'locations' | 'users';
  ids: string[];
  targetPerAgent?: number;
  dueDate?: string;
}

export interface FormRecord {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  binding: FormBinding;
  /** Farmer group profile forms can be per group type. */
  groupType?: string;
  /** Surveys can be about a record (farmer, community, group). */
  subject?: 'farmer' | 'community' | 'farmerGroup';
  status: FormStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** The editable draft; publishing copies it into `versions`. */
  draft: FormSchema;
  versions: FormVersion[];
  assignment: FormAssignment;
  schedule: { start?: string; end?: string };
  testUserIds: string[];
}

/** Shared option lists used across forms (PRD G1). */
export interface OptionList {
  id: string;
  orgId: string;
  name: Partial<Record<'en' | 'fr', string>>;
  options: Option[];
  updatedAt: string;
}

export interface ResponseReview {
  action: 'APPROVED' | 'REJECTED' | 'NEEDS_FIX' | 'EDITED' | 'RESUBMITTED';
  by: string;
  at: string;
  comment?: string;
  fields?: string[];
}

export interface SurveyResponse {
  id: string;
  orgId: string;
  formId: string;
  version: number;
  number: string;
  subject?: { entity: 'farmer' | 'community' | 'farmerGroup'; id: string };
  agentId?: string;
  userId: string;
  startedAt?: string;
  submittedAt: string;
  gps?: { lat: number; lng: number; accuracy: number };
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEEDS_FIX';
  answers: Record<string, unknown>;
  completion: number;
  test?: boolean;
  device: 'mobile' | 'web';
  reviews: ResponseReview[];
}
