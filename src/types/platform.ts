import type { ISODate, Lang } from './core';

export type OrgType = 'PLATFORM' | 'SUPPLIER' | 'BUYER' | 'BOTH' | 'PARTNER';
export type OrgStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'DEACTIVATED';

export interface Organisation {
  id: string;
  code: string;
  name: string;
  legalName: string;
  type: OrgType;
  countries: string[];
  currency: string;
  /** BCP-47 locale used for numbers, money and dates (e.g. en-GH, fr-CI). */
  locale: string;
  language: Lang;
  languages: Lang[];
  timezone: string;
  weekStart: 0 | 1 | 6;
  planId: string;
  status: OrgStatus;
  branding: {
    primaryColor: string;
    logoText: string;
    senderName: string;
    signatureName: string;
    /** Uploaded logo as a data URL (prototype only). */
    logoDataUrl?: string;
    replyTo?: string;
    emailHeader?: string;
    emailFooter?: string;
    receiptFooter?: string;
    social?: { website?: string; facebook?: string; linkedin?: string; x?: string };
  };
  tradingName?: string;
  registrationNo?: string;
  taxId?: string;
  address?: string;
  /** Month the fiscal year starts (1 = January). */
  fiscalYearStart?: number;
  createdAt: ISODate;
  email?: string;
  phone?: string;
  website?: string;
  /** Present on companies created through the wizard or sign-up: drives the setup checklist. */
  onboarding?: { via: 'WIZARD' | 'SIGNUP'; template: string; dismissed: boolean; done: string[]; description?: string };
}

export interface Plan {
  id: string;
  name: string;
  modules: string[];
  limits: { agents: number; farmers: number };
  /** Wildcard permission patterns a company on this plan may grant. */
  permissionCeiling: string[];
}

export interface Country {
  code: string;
  name: { en: string; fr: string };
  currency: string;
  dialCode: string;
  defaultLanguage: Lang;
  timezone: string;
  locationLevels: { en: string; fr: string }[];
  paymentProviders: string[];
  smsProviders: string[];
}

export interface Currency {
  code: string;
  minorUnits: number;
  name: string;
}

export interface Lead {
  id: string;
  kind: 'CONTACT' | 'DEMO' | 'SIGNUP';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  businessName: string;
  industry: string;
  message: string;
  createdAt: ISODate;
}

export interface DataSharingGrant {
  id: string;
  fromOrgId: string;
  toOrgId: string;
  scopes: ('farmers' | 'communities' | 'purchases' | 'orders' | 'traceability' | 'impact')[];
  /** Farmers and communities shared: these communities (and their farmers); every community when empty. */
  communityIds?: string[];
  note?: string;
  createdAt: ISODate;
  status: 'ACTIVE' | 'REVOKED';
}
