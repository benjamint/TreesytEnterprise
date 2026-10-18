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
}

export interface Permission {
  key: string;
  module: string;
  resource: string;
  action: string;
}
