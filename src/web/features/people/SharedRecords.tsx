import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Lock, Share2 } from 'lucide-react';
import type { Community, Farmer } from '@/types';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar } from '@/components/shared/ListKit';
import { sharedCommunities, sharedFarmers, type Shared } from '@/services/sharingService';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useActor, useFormat, useT } from '@/stores/hooks';

/** "Shared by Vitara": a read-only chip on records another company shares with this one (PRD A5). */
export function SharedChip({ fromOrgId }: { fromOrgId: string }) {
  const { t } = useT();
  const name = usePlatformStore((s) => s.orgs.find((o) => o.id === fromOrgId)?.name ?? fromOrgId);
  return <Badge tone="info"><Share2 className="h-3 w-3" aria-hidden="true" /> {t('share.sharedBy', { company: name })}</Badge>;
}

export function useSharedCounts() {
  const { orgId } = useActor();
  const grants = usePlatformStore((s) => s.grants);
  const communities = useCommunityStore((s) => s.communities);
  const farmers = useFarmerStore((s) => s.farmers);
  return useMemo(() => ({ communities: sharedCommunities(orgId, communities, grants), farmers: sharedFarmers(orgId, farmers, grants) }), [orgId, grants, communities, farmers]);
}

const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}•••${p.slice(-2)}` : '•••');

function ReadOnlyNote({ fromOrgId }: { fromOrgId: string }) {
  const { t } = useT();
  const name = usePlatformStore((s) => s.orgs.find((o) => o.id === fromOrgId)?.name ?? '');
  return <p className="flex items-start gap-2 rounded-ctl bg-canvas px-3 py-2 text-[13px] text-body"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" /> {t('share.readOnly', { company: name })}</p>;
}

export function SharedCommunitiesTab() {
  const { t, terms } = useT();
  const f = useFormat();
  const { communities } = useSharedCounts();
  const farmers = useFarmerStore((s) => s.farmers);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Shared<Community>>();
  const shown = communities.filter((x) => !q || x.row.name.toLowerCase().includes(q.toLowerCase()));
  const columns = useMemo<ColumnDef<Shared<Community>, unknown>[]>(() => [
    { id: 'name', header: terms.community, accessorFn: (x) => x.row.name, cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'code', header: t('share.code'), accessorFn: (x) => x.row.code },
    { id: 'farmers', header: terms.farmers, accessorFn: (x) => farmers.filter((fm) => fm.communityId === x.row.id).length },
    { id: 'from', header: t('share.owner'), accessorFn: (x) => x.fromOrgId, cell: (c) => <SharedChip fromOrgId={c.getValue() as string} /> },
  ], [t, terms, farmers]);
  return (
    <>
      <p className="mb-4 text-[14px] text-muted">{t('share.communitiesHint')}</p>
      <FilterBar search={q} onSearch={setQ} placeholder={t('share.search')} onClear={() => setQ('')} />
      <DataTable columns={columns} data={shown} onRowClick={setOpen} getRowId={(x) => x.row.id} empty={t('share.none')} />
      {open && (
        <DetailDrawer open onClose={() => setOpen(undefined)} title={open.row.name} subtitle={open.row.code} badges={<SharedChip fromOrgId={open.fromOrgId} />}
          tabs={[{ key: 'details', label: t('field.tab.details'), content: (
            <div className="space-y-4">
              <ReadOnlyNote fromOrgId={open.fromOrgId} />
              <Facts items={[[t('share.population'), f.number(open.row.population)], [terms.farmers, f.number(farmers.filter((fm) => fm.communityId === open.row.id).length)], [t('share.profiled'), f.date(open.row.profiledAt)], [t('share.gps'), `${open.row.gps.lat.toFixed(4)}, ${open.row.gps.lng.toFixed(4)}`]]} />
            </div>
          ) }]} />
      )}
    </>
  );
}

export function SharedFarmersTab() {
  const { t, terms } = useT();
  const f = useFormat();
  const { farmers } = useSharedCounts();
  const communities = useCommunityStore((s) => s.communities);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Shared<Farmer>>();
  const community = (id: string) => communities.find((c) => c.id === id)?.name ?? '';
  const shown = farmers.filter((x) => !q || `${x.row.firstName} ${x.row.lastName} ${x.row.farmerCode}`.toLowerCase().includes(q.toLowerCase()));
  const columns = useMemo<ColumnDef<Shared<Farmer>, unknown>[]>(() => [
    { id: 'name', header: t('col.name'), accessorFn: (x) => `${x.row.firstName} ${x.row.lastName}`, cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'code', header: t('share.code'), accessorFn: (x) => x.row.farmerCode, cell: (c) => <span className="font-mono text-[12px]">{c.getValue() as string}</span> },
    { id: 'community', header: terms.community, accessorFn: (x) => community(x.row.communityId) },
    { id: 'gender', header: t('col.gender'), accessorFn: (x) => t(`gender.${x.row.gender}`) },
    { id: 'from', header: t('share.owner'), accessorFn: (x) => x.fromOrgId, cell: (c) => <SharedChip fromOrgId={c.getValue() as string} /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, terms, communities]);
  return (
    <>
      <p className="mb-4 text-[14px] text-muted">{t('share.farmersHint')}</p>
      <FilterBar search={q} onSearch={setQ} placeholder={t('share.search')} onClear={() => setQ('')} />
      <DataTable columns={columns} data={shown} onRowClick={setOpen} getRowId={(x) => x.row.id} empty={t('share.none')} />
      {open && (
        <DetailDrawer open onClose={() => setOpen(undefined)} title={`${open.row.firstName} ${open.row.lastName}`} subtitle={open.row.farmerCode} badges={<SharedChip fromOrgId={open.fromOrgId} />}
          tabs={[{ key: 'details', label: t('field.tab.details'), content: (
            <div className="space-y-4">
              <ReadOnlyNote fromOrgId={open.fromOrgId} />
              <Facts items={[[terms.community, community(open.row.communityId)], [t('col.gender'), t(`gender.${open.row.gender}`)], [t('share.phone'), maskPhone(open.row.phone)], [t('share.registered'), f.date(open.row.registeredAt)], [t('share.crop'), open.row.primaryCrop]]} />
            </div>
          ) }]} />
      )}
    </>
  );
}
