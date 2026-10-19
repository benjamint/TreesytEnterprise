import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { ChevronRight, FileUp, MapPinned, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { LocationLevel, LocationNode, Zone } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/shared/Field';
import { comingSoon } from '@/components/shared/coming-soon';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildTree, descendants, importLocations, levelLabel, suggestCode, type TreeNode } from '@/engines/locations';
import { cn, uid } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useLocationStore } from '@/stores/locationStore';
import { useActor, useCurrentOrg, useFormat, useLang, useT } from '@/stores/hooks';
import { auditSettings } from '@/services/settingsService';
import { bind, useSettingsDraft } from '../draft';
import { AddRow, EditTable, LangInputs, NumberInput, RowDelete, Section, SettingsFrame, TextInput } from '../kit';

const KEYS = ['locationLevels', 'zones'] as const;

/** Settings → Locations (PRD A4, 8.13): level labels, the location tree, CSV import and zones. */
export function LocationsPage() {
  const { orgId } = useActor();
  const org = useCurrentOrg();
  const lang = useLang();
  const { t } = useT();
  const f = useFormat();
  const d = useSettingsDraft('locations', KEYS);
  const { locationLevels: levels, zones } = d.value;
  const allNodes = useLocationStore((s) => s.nodes);
  const stored = useMemo(() => allNodes.filter((n) => n.orgId === orgId), [allNodes, orgId]);
  const [nodeDraft, setNodeDraft] = useState<LocationNode[] | null>(null);
  const nodes = nodeDraft ?? stored;
  const communities = useCommunityStore((s) => s.communities);
  const used = useMemo(() => new Set(communities.filter((c) => c.orgId === orgId).map((c) => c.locationNodeId)), [communities, orgId]);
  const [importOpen, setImportOpen] = useState(false);
  const [zonePicker, setZonePicker] = useState<string | null>(null);
  const langs = org.languages.length ? org.languages : [org.language];

  const nodesDirty = nodeDraft !== null && JSON.stringify(nodeDraft) !== JSON.stringify(stored);
  const dirty = d.dirty || nodesDirty;
  const save = () => {
    if (d.dirty) d.save();
    if (nodesDirty) {
      useLocationStore.getState().setOrgNodes(orgId, nodeDraft!);
      auditSettings(orgId, 'locations', { nodes: nodeDraft!.length }, { nodes: stored.length });
    }
    setNodeDraft(null);
  };
  const cancel = () => {
    d.cancel();
    setNodeDraft(null);
  };
  const editNodes = (fn: (n: LocationNode[]) => LocationNode[]) => setNodeDraft((cur) => fn(cur ?? stored));

  const levelCount = (id: string) => nodes.filter((n) => n.levelId === id).length;
  const setLevel = (i: number, patch: Partial<LocationLevel>) => d.set('locationLevels', levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const errors: string[] = [];
  if (levels.some((l) => !(l.label.en ?? l.label[org.language] ?? '').trim())) errors.push(t('set.locations.errLabel'));
  if (zones.some((z) => !z.name.trim())) errors.push(t('set.locations.errZone'));

  return (
    <SettingsFrame page="locations" {...bind(d)} dirty={dirty} onSave={save} onCancel={cancel} errors={errors}>
      <Section title={t('set.locations.levels')} description={t('set.locations.levelsHint')}>
        <EditTable head={['#', t('set.locations.label'), t('set.locations.codeLength'), t('set.locations.nodes'), '']}>
          {levels.map((l, i) => (
            <tr key={l.id}>
              <td className="w-10 font-mono text-muted">{i + 1}</td>
              <td><LangInputs label={t('set.locations.label')} value={l.label} onChange={(label) => setLevel(i, { label })} languages={langs} /></td>
              <td className="w-32"><NumberInput value={l.codeLength ?? 3} min={1} max={8} onChange={(v) => setLevel(i, { codeLength: Math.round(v) })} aria-label={t('set.locations.codeLength')} /></td>
              <td className="w-24 tnum text-muted">{f.number(levelCount(l.id))}</td>
              <td className="w-12">
                {i === levels.length - 1 && levels.length > 1 && levelCount(l.id) === 0 && <RowDelete label={t('set.remove')} onClick={() => d.set('locationLevels', levels.slice(0, -1))} />}
              </td>
            </tr>
          ))}
        </EditTable>
        <div className="mt-3">
          <AddRow onClick={() => d.set('locationLevels', [...levels, { id: uid('level'), label: { en: t('set.locations.newLevel') }, codeLength: 3 }])}>{t('set.locations.addLevel')}</AddRow>
        </div>
      </Section>

      <Section
        title={t('set.locations.tree')}
        description={t('set.locations.treeHint', { count: nodes.length })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}><FileUp /> {t('set.locations.import')}</Button>
            <Button variant="ghost" size="sm" onClick={() => comingSoon()}><MapPinned /> {t('set.locations.boundaries')}</Button>
          </div>
        }
      >
        <LocationTree nodes={nodes} levels={levels} used={used} onChange={editNodes} />
      </Section>

      <Section title={t('set.locations.zones')} description={t('set.locations.zonesHint')}>
        <EditTable head={[t('set.locations.zoneName'), t('set.locations.zoneNodes'), '']}>
          {zones.map((z) => {
            const tops = z.nodeIds.map((id) => nodes.find((n) => n.id === id)).filter((n): n is LocationNode => !!n && !z.nodeIds.includes(n.parentId ?? ''));
            return (
              <tr key={z.id}>
                <td className="w-64"><TextInput value={z.name} onChange={(name) => d.set('zones', zones.map((x) => (x.id === z.id ? { ...x, name } : x)))} aria-label={t('set.locations.zoneName')} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tops.slice(0, 6).map((n) => <Badge key={n.id} tone="neutral">{n.name}</Badge>)}
                    {tops.length > 6 && <Badge tone="neutral">+{tops.length - 6}</Badge>}
                    <span className="text-[12px] text-muted">{t('set.locations.zoneCount', { count: z.nodeIds.length })}</span>
                    <Button variant="link" size="xs" onClick={() => setZonePicker(z.id)}>{t('set.locations.chooseNodes')}</Button>
                  </div>
                </td>
                <td className="w-12"><RowDelete label={t('set.remove')} onClick={() => d.set('zones', zones.filter((x) => x.id !== z.id))} /></td>
              </tr>
            );
          })}
        </EditTable>
        <div className="mt-3">
          <AddRow onClick={() => d.set('zones', [...zones, { id: uid('zone'), name: t('set.locations.newZone'), nodeIds: [] }])}>{t('set.locations.addZone')}</AddRow>
        </div>
      </Section>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        levels={levels}
        onImport={(rows) => {
          const res = importLocations(nodes, levels, rows, orgId, () => uid('loc'));
          editNodes(() => res.nodes);
          setImportOpen(false);
          if (res.errors.length) toast.warning(t('set.locations.importedWithErrors', { created: res.created, errors: res.errors.length, rows: res.errors.map((e) => e.row).join(', ') }));
          else toast.success(t('set.locations.imported', { created: res.created }));
        }}
      />
      {zonePicker && (
        <ZonePicker
          zone={zones.find((z) => z.id === zonePicker)!}
          nodes={nodes}
          levels={levels}
          lang={lang}
          onClose={() => setZonePicker(null)}
          onSave={(ids) => {
            d.set('zones', zones.map((z) => (z.id === zonePicker ? { ...z, nodeIds: ids } : z)));
            setZonePicker(null);
          }}
        />
      )}
    </SettingsFrame>
  );
}

function LocationTree({ nodes, levels, used, onChange }: { nodes: LocationNode[]; levels: LocationLevel[]; used: Set<string>; onChange: (fn: (n: LocationNode[]) => LocationNode[]) => void }) {
  const { t } = useT();
  const lang = useLang();
  const { orgId } = useActor();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const hit = new Set<string>();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (!n.name.toLowerCase().includes(q) && !n.code.toLowerCase().includes(q)) continue;
      let cur: LocationNode | undefined = n;
      while (cur) {
        hit.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    }
    return hit;
  }, [nodes, q]);

  const add = (parent: LocationNode | null) => {
    const li = parent ? levels.findIndex((l) => l.id === parent.levelId) + 1 : 0;
    const level = levels[li];
    if (!level) return;
    const name = t('set.locations.newNode', { level: levelLabel(levels, level.id, lang) });
    const taken = new Set(nodes.filter((n) => n.parentId === (parent?.id ?? null)).map((n) => n.code));
    onChange((ns) => [...ns, { id: uid('loc'), orgId, levelId: level.id, parentId: parent?.id ?? null, name, code: suggestCode(name, taken, level.codeLength ?? 3) }]);
    if (parent) setOpen((o) => new Set(o).add(parent.id));
  };
  const update = (id: string, patch: Partial<LocationNode>) => onChange((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const remove = (id: string) => onChange((ns) => ns.filter((n) => n.id !== id));

  const render = (n: TreeNode, depth: number) => {
    if (matches && !matches.has(n.id)) return null;
    const isOpen = open.has(n.id) || !!matches;
    const li = levels.findIndex((l) => l.id === n.levelId);
    const childLevel = levels[li + 1];
    const inUse = used.has(n.id) || n.children.length > 0;
    return (
      <li key={n.id}>
        <div className="group flex items-center gap-2 border-t border-line py-1.5 pr-2" style={{ paddingLeft: 8 + depth * 22 }}>
          <button
            type="button"
            onClick={() => setOpen((o) => { const s = new Set(o); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); return s; })}
            className={cn('flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-canvas', !n.children.length && 'invisible')}
            aria-label={isOpen ? t('set.locations.collapse') : t('set.locations.expand')}
            aria-expanded={isOpen}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
          </button>
          <span className="w-24 shrink-0 truncate text-[12px] uppercase tracking-[0.06em] text-label">{levelLabel(levels, n.levelId, lang)}</span>
          <Input compact value={n.name} onChange={(e) => update(n.id, { name: e.target.value })} className="h-9 max-w-xs" aria-label={t('set.locations.nodeName')} />
          <Input compact value={n.code} onChange={(e) => update(n.id, { code: e.target.value.toUpperCase() })} className="h-9 w-24 font-mono" aria-label={t('set.locations.nodeCode')} />
          <span className="ml-auto text-[12px] text-muted">{n.children.length ? t('set.locations.children', { count: n.children.length }) : ''}</span>
          {childLevel && (
            <Button variant="ghost" size="xs" onClick={() => add(n)} className="opacity-70 group-hover:opacity-100">
              <Plus /> {levelLabel(levels, childLevel.id, lang)}
            </Button>
          )}
          {inUse ? <span className="w-8" /> : <RowDelete label={t('set.remove')} onClick={() => remove(n.id)} />}
        </div>
        {isOpen && n.children.length > 0 && <ul>{n.children.sort((a, b) => a.name.localeCompare(b.name)).map((c) => render(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="rounded-ctl border border-line">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input compact value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('set.locations.search')} className="pl-9" aria-label={t('set.locations.search')} />
        </div>
        {levels[0] && <AddRow onClick={() => add(null)}>{levelLabel(levels, levels[0].id, lang)}</AddRow>}
      </div>
      <ul className="max-h-[520px] overflow-y-auto">{tree.sort((a, b) => a.name.localeCompare(b.name)).map((n) => render(n, 0))}</ul>
      {matches && matches.size === 0 && <p className="border-t border-line px-4 py-6 text-center text-[14px] text-muted">{t('set.locations.noMatch')}</p>}
    </div>
  );
}

function ImportDialog({ open, onOpenChange, levels, onImport }: { open: boolean; onOpenChange: (o: boolean) => void; levels: LocationLevel[]; onImport: (rows: string[][]) => void }) {
  const { t } = useT();
  const lang = useLang();
  const header = levels.map((l) => levelLabel(levels, l.id, lang)).join(',');
  const [text, setText] = useState('');
  const parse = () => {
    const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
    const rows = res.data;
    const first = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
    const hasHeader = levels.every((l, i) => first[i] === levelLabel(levels, l.id, lang).toLowerCase());
    onImport(hasHeader ? rows.slice(1) : rows);
    setText('');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('set.locations.importTitle')}</DialogTitle>
          <DialogDescription>{t('set.locations.importHint', { header })}</DialogDescription>
        </DialogHeader>
        <label className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-ctl border border-line px-4 text-[14px] font-medium text-ink hover:border-brand/40">
          <FileUp className="h-4 w-4" /> {t('set.locations.chooseFile')}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => setText(await e.target.files?.[0]?.text() ?? '')} />
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={`${header}\n…`} aria-label={t('set.locations.importTitle')} className="w-full rounded-ctl border border-line bg-surface p-3 font-mono text-[13px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" />
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={parse} disabled={!text.trim()}>{t('set.locations.importRun')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZonePicker({ zone, nodes, levels, lang, onClose, onSave }: { zone: Zone; nodes: LocationNode[]; levels: LocationLevel[]; lang: 'en' | 'fr'; onClose: () => void; onSave: (ids: string[]) => void }) {
  const { t } = useT();
  const pickLevels = levels.slice(0, Math.max(1, levels.length - 1)).map((l) => l.id);
  const options = nodes.filter((n) => pickLevels.includes(n.levelId)).sort((a, b) => levels.findIndex((l) => l.id === a.levelId) - levels.findIndex((l) => l.id === b.levelId) || a.name.localeCompare(b.name));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(zone.nodeIds.filter((id) => options.some((o) => o.id === id))));
  const [q, setQ] = useState('');
  const shown = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('set.locations.zoneTitle', { zone: zone.name })}</DialogTitle>
          <DialogDescription>{t('set.locations.zonePickHint')}</DialogDescription>
        </DialogHeader>
        <Input compact value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('set.locations.search')} aria-label={t('set.locations.search')} />
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-ctl border border-line p-3">
          {shown.map((o) => (
            <Checkbox
              key={o.id}
              label={o.name}
              description={levelLabel(levels, o.levelId, lang)}
              checked={picked.has(o.id)}
              onChange={(e) => setPicked((p) => { const s = new Set(p); if (e.target.checked) s.add(o.id); else s.delete(o.id); return s; })}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => {
              // A zone covers the picked nodes and everything below them.
              const ids = new Set<string>();
              for (const id of picked) {
                ids.add(id);
                for (const dsc of descendants(nodes, id)) ids.add(dsc.id);
              }
              onSave([...ids]);
            }}
          >
            {t('set.locations.applyZone', { count: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
