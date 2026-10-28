import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileUp, MapPinned, Move, Pencil, Plus, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { LocationNode } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { Facts, TabEmpty } from '@/components/shared/ListKit';
import { comingSoon } from '@/components/shared/coming-soon';
import { buildTree, descendants, levelLabel, pathLabel, suggestCode, type TreeNode } from '@/engines/locations';
import { cn, uid } from '@/lib/utils';
import { useAgentStore } from '@/stores/agentStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLandStore } from '@/stores/landStore';
import { useLocationStore } from '@/stores/locationStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { Field } from './CommunityForm';
import { logActivity } from './shared';

type Edit = { mode: 'add' | 'edit' | 'move'; node: LocationNode };

/** Locations explorer (PRD C1): tree by company levels, node detail with counts, add / edit / move. */
export function LocationsExplorerPage() {
  const { orgId, userId } = useActor();
  const { t, terms } = useT();
  const f = useFormat();
  const lang = useLang();
  const navigate = useNavigate();
  const settings = useOrgSettings();
  const levels = settings.locationLevels;
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const plots = useOrgRows(useLandStore((s) => s.plots));
  const agents = useOrgRows(useAgentStore((s) => s.agents));
  const tree = useMemo(() => buildTree(nodes).sort((a, b) => a.name.localeCompare(b.name)), [nodes]);
  const [selected, setSelected] = useState<string | null>(tree[0]?.id ?? null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree.slice(0, 1).map((n) => n.id)));
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const node = nodes.find((n) => n.id === selected);

  const counts = useMemo(() => {
    if (!node) return null;
    const ids = new Set([node.id, ...descendants(nodes, node.id).map((n) => n.id)]);
    const coms = communities.filter((c) => ids.has(c.locationNodeId));
    const comIds = new Set(coms.map((c) => c.id));
    return {
      communities: coms,
      farmers: farmers.filter((x) => comIds.has(x.communityId)).length,
      plots: plots.filter((x) => comIds.has(x.communityId)).length,
      agents: agents.filter((a) => a.areaNodeIds.some((id) => ids.has(id)) || coms.some((c) => c.agentIds.includes(a.id))).length,
      children: nodes.filter((n) => n.parentId === node.id).sort((a, b) => a.name.localeCompare(b.name)),
      zones: settings.zones.filter((z) => z.nodeIds.includes(node.id)),
    };
  }, [node, nodes, communities, farmers, plots, agents, settings.zones]);

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return null;
    const hit = new Set<string>();
    for (const n of nodes) if (n.name.toLowerCase().includes(query) || n.code.toLowerCase().includes(query)) {
      hit.add(n.id);
      let p = n.parentId;
      while (p) { hit.add(p); p = nodes.find((x) => x.id === p)?.parentId ?? null; }
    }
    return hit;
  }, [nodes, query]);

  const levelIndex = (id: string) => levels.findIndex((l) => l.id === id);
  const saveEdit = (next: LocationNode) => {
    const exists = nodes.some((n) => n.id === next.id);
    useLocationStore.getState().setOrgNodes(orgId, exists ? nodes.map((n) => (n.id === next.id ? next : n)) : [...nodes, next]);
    logActivity(orgId, 'location', next.id, edit?.mode === 'move' ? 'location.moved' : exists ? 'location.updated' : 'location.created', { name: next.name, path: pathLabel([...nodes.filter((n) => n.id !== next.id), next], next.id) }, userId ?? 'system');
    toast.success(t(`people.loc.${edit?.mode ?? 'edit'}Done`, { name: next.name }));
    setSelected(next.id);
    if (next.parentId) setOpen((o) => new Set([...o, next.parentId!]));
    setEdit(null);
  };

  const renderNode = (n: TreeNode, depth: number) => {
    if (matches && !matches.has(n.id)) return null;
    const expanded = open.has(n.id) || !!matches;
    return (
      <li key={n.id}>
        <div className={cn('flex items-center gap-1 rounded-ctl pr-2 text-[14px]', selected === n.id ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-canvas')} style={{ paddingLeft: depth * 16 + 4 }}>
          {n.children.length ? (
            <button type="button" onClick={() => setOpen((o) => { const s = new Set(o); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); return s; })} aria-label={expanded ? t('people.loc.collapse') : t('people.loc.expand')} aria-expanded={expanded} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-ink">
              <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
            </button>
          ) : <span className="w-7" />}
          <button type="button" onClick={() => setSelected(n.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
            <span className="truncate">{n.name}</span>
            <span className="font-mono text-[11px] text-muted">{n.code}</span>
            {n.children.length > 0 && <span className="ml-auto tnum text-[11px] text-muted">{n.children.length}</span>}
          </button>
        </div>
        {expanded && n.children.length > 0 && <ul>{[...n.children].sort((a, b) => a.name.localeCompare(b.name)).map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={terms.communities}
        title={t('nav.locations')}
        description={t('people.loc.desc', { levels: levels.map((l) => levelLabel(levels, l.id, lang)).join(' → ') })}
        actions={
          <>
            <PermissionGate permission="imports.view"><Button variant="secondary" onClick={() => navigate('/app/imports?type=locations')}><FileUp /> {t('people.loc.import')}</Button></PermissionGate>
            <PermissionGate permission="settings.view"><Button variant="secondary" onClick={() => navigate('/app/settings/locations')}><Settings2 /> {t('people.loc.zonesLevels')}</Button></PermissionGate>
          </>
        }
        primary={<PermissionGate permission="locations.create"><Button onClick={() => setEdit({ mode: 'add', node: { id: uid('loc'), orgId, levelId: levels[0]!.id, parentId: null, name: '', code: '' } })}><Plus /> {t('people.loc.addTop', { level: levelLabel(levels, levels[0]!.id, lang) })}</Button></PermissionGate>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="rounded-card border border-line bg-surface p-3 shadow-soft">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input compact value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('people.loc.search')} aria-label={t('people.loc.search')} className="pl-9" />
          </div>
          <ul className="max-h-[calc(100vh-300px)] min-h-[300px] overflow-y-auto scrollbar-thin">{tree.map((n) => renderNode(n, 0))}</ul>
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          {node && counts ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge tone="brand">{levelLabel(levels, node.levelId, lang)}</Badge>
                  <h2 className="mt-2 text-[24px] font-semibold text-ink">{node.name}</h2>
                  <p className="text-[14px] text-muted">{pathLabel(nodes, node.id)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PermissionGate permission="locations.edit"><Button size="sm" variant="secondary" onClick={() => setEdit({ mode: 'edit', node })}><Pencil /> {t('people.edit')}</Button></PermissionGate>
                  {node.parentId && <PermissionGate permission="locations.edit"><Button size="sm" variant="secondary" onClick={() => setEdit({ mode: 'move', node })}><Move /> {t('people.loc.move')}</Button></PermissionGate>}
                  {levelIndex(node.levelId) < levels.length - 1 && <PermissionGate permission="locations.create"><Button size="sm" onClick={() => setEdit({ mode: 'add', node: { id: uid('loc'), orgId, levelId: levels[levelIndex(node.levelId) + 1]!.id, parentId: node.id, name: '', code: '' } })}><Plus /> {t('people.loc.addChild', { level: levelLabel(levels, levels[levelIndex(node.levelId) + 1]!.id, lang) })}</Button></PermissionGate>}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {[[terms.communities, counts.communities.length], [terms.farmers, counts.farmers], [terms.agents, counts.agents], [t('people.loc.plots'), counts.plots]].map(([k, v]) => (
                  <div key={String(k)} className="rounded-ctl border border-line p-4"><div className="eyebrow">{k}</div><div className="tnum mt-1 text-[24px] font-semibold text-ink">{f.number(Number(v))}</div></div>
                ))}
              </div>
              <Facts items={[
                [t('col.code'), <span className="font-mono">{node.code}</span>],
                [t('people.loc.parent'), node.parentId ? pathLabel(nodes, node.parentId) : '—'],
                [t('people.loc.zones'), counts.zones.map((z) => z.name).join(', ') || '—'],
                [t('people.loc.boundary'), <Button key="b" variant="link" size="xs" className="px-0" onClick={() => comingSoon()}><MapPinned className="h-3.5 w-3.5" /> {t('people.loc.drawBoundary')}</Button>],
              ]} />
              {counts.children.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[15px] font-semibold text-ink">{t('people.loc.children', { level: levelLabel(levels, counts.children[0]!.levelId, lang), count: counts.children.length })}</h3>
                  <div className="flex flex-wrap gap-2">{counts.children.map((c) => <button key={c.id} type="button" onClick={() => { setSelected(c.id); setOpen((o) => new Set([...o, node.id])); }} className="rounded-full border border-line px-3 py-1 text-[13px] text-body hover:border-brand/50 hover:text-brand">{c.name}</button>)}</div>
                </div>
              )}
              {counts.communities.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[15px] font-semibold text-ink">{terms.communities}</h3>
                  <ul className="divide-y divide-line rounded-ctl border border-line">
                    {counts.communities.slice(0, 30).map((c) => <li key={c.id}><button type="button" onClick={() => navigate(`/app/communities?open=${c.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] hover:bg-canvas"><span className="font-mono text-[12px] text-muted">{c.code}</span><span className="flex-1 text-ink">{c.name}</span><span className="text-[12px] text-muted">{f.number(c.population)}</span></button></li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : <TabEmpty>{t('people.loc.pick')}</TabEmpty>}
        </div>
      </div>
      {edit && <NodeDialog edit={edit} nodes={nodes} onClose={() => setEdit(null)} onSave={saveEdit} />}
    </>
  );
}

function NodeDialog({ edit, nodes, onClose, onSave }: { edit: Edit; nodes: LocationNode[]; onClose: () => void; onSave: (n: LocationNode) => void }) {
  const { t } = useT();
  const lang = useLang();
  const levels = useOrgSettings().locationLevels;
  const [n, setN] = useState(edit.node);
  const level = levels.find((l) => l.id === n.levelId);
  const siblings = nodes.filter((x) => x.parentId === n.parentId && x.levelId === n.levelId && x.id !== n.id);
  const taken = new Set(siblings.map((x) => x.code));
  const parentLevel = levels[levels.findIndex((l) => l.id === n.levelId) - 1];
  const parents = parentLevel ? nodes.filter((x) => x.levelId === parentLevel.id && x.id !== n.id).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const dupName = siblings.some((x) => x.name.trim().toLowerCase() === n.name.trim().toLowerCase());
  const dupCode = !!n.code && taken.has(n.code);
  const ok = n.name.trim() && n.code.trim() && !dupName && !dupCode;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t(`people.loc.${edit.mode}Title`, { level: levelLabel(levels, n.levelId, lang), name: edit.node.name })}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {edit.mode !== 'move' && (
            <>
              <Field label={t('people.name')} error={dupName ? t('people.loc.dupName') : undefined}>
                <Input compact autoFocus value={n.name} onChange={(e) => setN({ ...n, name: e.target.value, code: edit.mode === 'add' ? suggestCode(e.target.value, taken, level?.codeLength ?? 3) : n.code })} aria-label={t('people.name')} />
              </Field>
              <Field label={t('col.code')} error={dupCode ? t('people.loc.dupCode') : undefined}>
                <Input compact value={n.code} onChange={(e) => setN({ ...n, code: e.target.value.toUpperCase() })} aria-label={t('col.code')} className="font-mono" />
              </Field>
            </>
          )}
          {edit.mode === 'move' && parentLevel && (
            <Field label={t('people.loc.newParent', { level: levelLabel(levels, parentLevel.id, lang) })}>
              <select value={n.parentId ?? ''} onChange={(e) => setN({ ...n, parentId: e.target.value })} aria-label={t('people.loc.parent')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
                {parents.map((p) => <option key={p.id} value={p.id}>{pathLabel(nodes, p.id)}</option>)}
              </select>
            </Field>
          )}
          {edit.mode === 'move' && <p className="text-[13px] text-muted">{t('people.loc.moveHint')}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!ok || (edit.mode === 'move' && n.parentId === edit.node.parentId)} onClick={() => onSave({ ...n, name: n.name.trim() })}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
