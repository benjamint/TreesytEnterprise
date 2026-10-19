import { useMemo } from 'react';
import type { SupportRequest, SupportType } from '@/types';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useSupportStore } from '@/stores/supportStore';
import { useLang, useOrgRows, useOrgSettings } from '@/stores/hooks';

/** Names for support records: types, groups, farmers, providers. */
export function useSupportLookups() {
  const lang = useLang();
  const settings = useOrgSettings();
  const groups = useOrgRows(useGroupStore((s) => s.groups));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const providers = useOrgRows(useSupportStore((s) => s.providers));
  return useMemo(() => {
    const g = new Map(groups.map((x) => [x.id, x]));
    const fa = new Map(farmers.map((x) => [x.id, x]));
    const p = new Map(providers.map((x) => [x.id, x]));
    const types = settings.support.types;
    return {
      types,
      type: (id?: string): SupportType | undefined => types.find((t) => t.id === id),
      typeName: (id?: string) => { const t = types.find((x) => x.id === id); return t ? t.name[lang] ?? t.name.en ?? t.id : '—'; },
      group: (id: string) => g.get(id),
      groupName: (id: string) => g.get(id)?.name ?? '—',
      farmer: (id: string) => fa.get(id),
      farmerName: (id: string) => { const x = fa.get(id); return x ? `${x.firstName} ${x.lastName}` : '—'; },
      providers,
      providerName: (id?: string) => (id ? p.get(id)?.name ?? '—' : '—'),
    };
  }, [groups, farmers, providers, settings.support.types, lang]);
}

export const BOARD: string[] = ['PENDING_SCORING', 'PENDING_APPROVAL', 'ON_HOLD', 'REJECTED', 'AGENT_CONFIRMATION', 'PENDING_DISBURSEMENT', 'DISBURSED', 'FULFILLED'];

export const approvalStatus = (r: SupportRequest) =>
  r.status === 'PENDING_SCORING' || r.status === 'PENDING_APPROVAL' ? 'PENDING' : r.status === 'REJECTED' ? 'REJECTED' : r.status === 'ON_HOLD' ? 'ON_HOLD' : 'APPROVED';
export const disbursementStatus = (r: SupportRequest) => (r.disbursements.length ? (r.lines.some((l) => l.status === 'CONFIRMED') ? 'PARTIAL_DISBURSEMENT' : 'PAID') : 'NOT_PAID');
export const fulfilmentKey = (r: SupportRequest) => ({ PENDING: 'PENDING', PARTIAL: 'PARTIALLY_FULFILLED', FULL: 'FULLY_FULFILLED' })[r.fulfilmentStatus];
