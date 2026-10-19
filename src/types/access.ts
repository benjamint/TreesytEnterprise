import type { ISODate, Lang } from './core';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DEACTIVATED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  language: Lang;
  status: UserStatus;
  avatarColor: string;
  isPlatformOwner?: boolean;
  /** Persona users appear in the role switcher. */
  persona?: boolean;
  lastActiveAt?: ISODate;
  /** Demo only: stored in clear so the prototype can sign people in. Every persona uses "demo1234". */
  password: string;
  passwordChangedAt?: ISODate;
  twoFactor: { enabled: boolean; method: 'APP' | 'SMS'; backupCodes: string[] };
  failedAttempts: number;
  /** Devices that skip the 2-step code ("Remember this device"). */
  trustedDevices: string[];
}

export interface Invite {
  id: string;
  token: string;
  orgId: string;
  email: string;
  name?: string;
  roleIds: string[];
  invitedBy: string;
  createdAt: ISODate;
  expiresAt: ISODate;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
}

export interface Session {
  id: string;
  userId: string;
  orgId: string;
  device: string;
  browser: string;
  os: string;
  location: string;
  ip: string;
  createdAt: ISODate;
  lastActiveAt: ISODate;
  revokedAt?: ISODate;
}

export interface ResetToken {
  token: string;
  userId: string;
  createdAt: ISODate;
  expiresAt: ISODate;
  usedAt?: ISODate;
}

export interface Membership {
  id: string;
  userId: string;
  orgId: string;
  roleIds: string[];
  status: UserStatus;
  /** Free-text title shown in the role switcher, e.g. "Community Engagement Officer". */
  title?: string;
}

export type RoleTemplate =
  | 'platformOwner' | 'companyAdmin' | 'operationsManager' | 'financeOfficer' | 'logisticsManager'
  | 'warehouseManager' | 'salesOfficer' | 'meOfficer' | 'sustainabilityOfficer' | 'fieldSupervisor'
  | 'fieldAgent' | 'warehouseOfficer' | 'buyerUser' | 'auditor';

export interface Role {
  id: string;
  orgId: string;
  template: RoleTemplate;
  /** Custom name; when empty the template name is translated. */
  name?: string;
  permissions: string[];
  /** Roles that sign in to the mobile app. */
  mobile?: boolean;
  /** Payment limits for people with this role (PRD E1 limits & controls). */
  payLimits?: { perPaymentMinor: number; dailyMinor: number };
}

export interface Permission {
  key: string;
  module: string;
  resource: string;
  action: string;
}
