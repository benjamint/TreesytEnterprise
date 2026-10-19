import { useCallback, useMemo, useState } from 'react';
import type { Organisation, OrgSettings } from '@/types';
import type { SettingsPage } from '@/app/routes';
import { useCan, useCurrentOrg, useOrgSettings } from '@/stores/hooks';
import { useSettingsStore } from '@/stores/settingsStore';
import { saveOrganisation, saveSettings } from '@/services/settingsService';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface Draft<T> {
  value: T;
  /** Replace part of the draft. */
  set: <K extends keyof T>(key: K, v: T[K] | ((prev: T[K]) => T[K])) => void;
  dirty: boolean;
  /** Save the draft, optionally with extra values computed at save time. */
  save: (extra?: Partial<T>) => void;
  cancel: () => void;
  /** Load the template values into the draft (saved only on Save). */
  reset: () => void;
  canReset: boolean;
}

/**
 * Local draft of some OrgSettings keys. Until the user edits, the draft follows the store, so
 * changes made in another tab or by another page show up straight away.
 */
export function useSettingsDraft<K extends keyof OrgSettings>(page: string, keys: readonly K[]): Draft<Pick<OrgSettings, K>> {
  const settings = useOrgSettings();
  const baseline = useSettingsStore((s) => s.baselines[settings.orgId]?.settings);
  const pick = useCallback((src: OrgSettings) => Object.fromEntries(keys.map((k) => [k, src[k]])) as Pick<OrgSettings, K>, [keys]);
  const original = useMemo(() => pick(settings), [pick, settings]);
  const [draft, setDraft] = useState<Pick<OrgSettings, K> | null>(null);
  const value = draft ?? original;
  return {
    value,
    set: (key, v) =>
      setDraft((d) => {
        const cur = d ?? original;
        const next = typeof v === 'function' ? (v as (p: unknown) => unknown)(cur[key]) : v;
        return { ...cur, [key]: next };
      }),
    dirty: draft !== null && !same(draft, original),
    save: (extra) => {
      saveSettings(settings.orgId, page, { ...value, ...extra });
      setDraft(null);
    },
    cancel: () => setDraft(null),
    reset: () => baseline && setDraft(pick({ ...settings, ...baseline, orgId: settings.orgId })),
    canReset: !!baseline && !same(pick(baseline), value),
  };
}

/** Same pattern for fields that live on the Organisation (profile, branding). */
export function useOrgDraft<K extends keyof Organisation>(page: string, keys: readonly K[]): Draft<Pick<Organisation, K>> {
  const org = useCurrentOrg();
  const baseline = useSettingsStore((s) => s.baselines[org.id]?.org);
  const pick = useCallback((src: Organisation) => Object.fromEntries(keys.map((k) => [k, src[k]])) as Pick<Organisation, K>, [keys]);
  const original = useMemo(() => pick(org), [pick, org]);
  const [draft, setDraft] = useState<Pick<Organisation, K> | null>(null);
  const value = draft ?? original;
  return {
    value,
    set: (key, v) =>
      setDraft((d) => {
        const cur = d ?? original;
        const next = typeof v === 'function' ? (v as (p: unknown) => unknown)(cur[key]) : v;
        return { ...cur, [key]: next };
      }),
    dirty: draft !== null && !same(draft, original),
    save: (extra) => {
      saveOrganisation(org.id, page, { ...value, ...extra });
      setDraft(null);
    },
    cancel: () => setDraft(null),
    reset: () => baseline && setDraft(pick(baseline)),
    canReset: !!baseline && !same(pick(baseline), value),
  };
}

/** Combine several drafts into one Save / Cancel / Reset. */
export function combine(...drafts: Draft<unknown>[]) {
  return {
    dirty: drafts.some((d) => d.dirty),
    save: () => drafts.forEach((d) => d.dirty && d.save()),
    cancel: () => drafts.forEach((d) => d.cancel()),
    reset: () => drafts.forEach((d) => d.reset()),
    canReset: drafts.some((d) => d.canReset),
  };
}

/** Permission needed to change each settings page (viewing needs settings.view). */
export function pagePermission(page: SettingsPage): string {
  if (page === 'users') return 'settings.manageUsers';
  if (page === 'roles') return 'settings.manageRoles';
  if (page === 'integrations') return 'settings.manageIntegrations';
  return 'settings.edit';
}

export function useCanEdit(page: SettingsPage) {
  return useCan()(pagePermission(page));
}


/** Props for SettingsFrame from a draft (or a combined draft). */
export function bind(d: { dirty: boolean; save: () => void; cancel: () => void; reset: () => void; canReset: boolean }) {
  return { dirty: d.dirty, onSave: () => d.save(), onCancel: d.cancel, onReset: d.reset, canReset: d.canReset };
}
