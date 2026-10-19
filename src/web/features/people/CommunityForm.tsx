import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Community } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/shared/Field';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { FormFields } from '@/components/forms/FormFields';
import { communityProfileForm } from '@/data/forms/profiles';
import { validateAnswers } from '@/engines/forms';
import { ancestorAtLevel, levelLabel, pathLabel } from '@/engines/locations';
import { recheck } from '@/services/qualityService';
import { uid } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useLocationStore } from '@/stores/locationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActor, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { logActivity, useLookups } from './shared';

/** Create / edit a community on the web (same fields as the mobile M3 flow). */
export function CommunityForm({ open, onClose, community }: { open: boolean; onClose: (savedId?: string) => void; community?: Community }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const lang = useLang();
  const settings = useOrgSettings();
  const nodes = useOrgRows(useLocationStore((s) => s.nodes));
  const lk = useLookups();
  const form = useMemo(() => communityProfileForm(orgId), [orgId]);
  const leafLevel = settings.locationLevels[settings.locationLevels.length - 1]?.id;
  const parentLevel = settings.locationLevels[settings.locationLevels.length - 2]?.id;
  const parents = useMemo(() => nodes.filter((n) => n.levelId === parentLevel).sort((a, b) => a.name.localeCompare(b.name)), [nodes, parentLevel]);
  const leafNode = community ? nodes.find((n) => n.id === community.locationNodeId) : undefined;
  const [name, setName] = useState(community?.name ?? '');
  const [parentId, setParentId] = useState(leafNode?.parentId ?? parents[0]?.id ?? '');
  const [population, setPopulation] = useState<number | ''>(community?.population ?? '');
  const [contact, setContact] = useState(community?.contactPerson ?? { name: '', phone: '' });
  const [gps, setGps] = useState(community?.gps ?? { lat: 0, lng: 0 });
  const [agentIds, setAgentIds] = useState<string[]>(community?.agentIds ?? []);
  const [answers, setAnswers] = useState<Record<string, unknown>>(community?.customFields ?? {});
  const [tried, setTried] = useState(false);
  const fieldAgents = lk.agents.filter((a) => a.status === 'ACTIVE' && !['at_wh', 'at_mag'].includes(a.agentTypeId));
  const errors = validateAnswers(form, answers);
  const missing = !name.trim() || !parentId;

  const save = () => {
    setTried(true);
    if (missing || errors.length) return;
    const now = new Date().toISOString();
    let nodeId = community?.locationNodeId;
    if (!community || leafNode?.parentId !== parentId || leafNode?.name !== name.trim()) {
      // The community is also a node at the lowest location level.
      const existing = nodes.find((n) => n.parentId === parentId && n.levelId === leafLevel && n.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) nodeId = existing.id;
      else {
        const node = { id: uid('loc'), orgId, levelId: leafLevel!, parentId, name: name.trim(), code: name.trim().slice(0, 3).toUpperCase() };
        useLocationStore.getState().setOrgNodes(orgId, [...nodes, node]);
        nodeId = node.id;
      }
    }
    const region = ancestorAtLevel(useLocationStore.getState().nodes, nodeId!, settings.locationLevels[0]!.id);
    const code = community?.code ?? useSettingsStore.getState().issueNumber(orgId, 'communityCode', { region: region?.code ?? '', date: new Date() });
    const next: Community = {
      ...(community ?? { id: uid('com'), createdAt: now, createdBy: userId ?? 'system', profiledAt: now, score: 0, flags: [] }),
      orgId, updatedAt: now, code, name: name.trim(), locationNodeId: nodeId!, population: Number(population || 0), agentIds, gps,
      contactPerson: contact, customFields: answers,
    } as Community;
    useCommunityStore.getState().saveCommunity(next);
    logActivity(orgId, 'community', next.id, community ? 'community.updated' : 'community.created', { name: next.name, code }, userId ?? 'system');
    recheck(orgId, 'community', [next.id], 'WEB', userId ?? 'system');
    toast.success(t(community ? 'people.community.saved' : 'people.community.created', { name: next.name, code }));
    onClose(next.id);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent closeLabel={t('common.close')} className="flex flex-col p-0">
        <div className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-semibold text-ink">{t(community ? 'people.community.edit' : 'people.community.new')}</SheetTitle></div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('people.name')} error={tried && !name.trim() ? t('form.error.required') : undefined}>
              <Input compact value={name} onChange={(e) => setName(e.target.value)} aria-label={t('people.name')} />
            </Field>
            <Field label={t('people.community.parent', { level: levelLabel(settings.locationLevels, parentLevel ?? '', lang) })}>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink" aria-label={t('people.location')}>
                {parents.map((p) => <option key={p.id} value={p.id}>{pathLabel(nodes, p.id)}</option>)}
              </select>
            </Field>
            <Field label={t('people.community.population')}><Input compact type="number" value={population} onChange={(e) => setPopulation(e.target.value === '' ? '' : Number(e.target.value))} aria-label={t('people.community.population')} /></Field>
            <Field label={t('people.community.gps')}>
              <div className="flex gap-2">
                <Input compact type="number" step="any" value={gps.lat} onChange={(e) => setGps({ ...gps, lat: Number(e.target.value) })} aria-label={t('people.lat')} />
                <Input compact type="number" step="any" value={gps.lng} onChange={(e) => setGps({ ...gps, lng: Number(e.target.value) })} aria-label={t('people.lng')} />
              </div>
            </Field>
            <Field label={t('people.community.contact')}><Input compact value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-label={t('people.community.contact')} /></Field>
            <Field label={t('people.phone')}><Input compact type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-label={t('people.phone')} /></Field>
          </div>
          <Field label={t('people.community.agents')}>
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded-ctl border border-line p-3 sm:grid-cols-2">
              {fieldAgents.map((a) => <Checkbox key={a.id} label={lk.agent(a.id)} checked={agentIds.includes(a.id)} onChange={(e) => setAgentIds(e.target.checked ? [...agentIds, a.id] : agentIds.filter((x) => x !== a.id))} />)}
            </div>
          </Field>
          <div>
            <h3 className="mb-3 text-[15px] font-semibold text-ink">{t('people.profile')} <span className="text-[12px] font-normal text-muted">{form.name} · {t('set.forms.v', { n: form.version })}</span></h3>
            <FormFields form={form} answers={answers} onChange={setAnswers} errors={tried ? errors : []} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[12px] text-danger" role="alert">{error}</span>}
    </label>
  );
}
