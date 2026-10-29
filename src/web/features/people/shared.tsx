import { useMemo, useState, type ChangeEvent } from 'react';
import { Download, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Leader, Money, RecordDocument } from '@/types';
import type { ScoreBreakdown, ScoreModel } from '@/engines/scoring';
import { makeEvent } from '@/engines/activity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/shared/Gates';
import { TabEmpty } from '@/components/shared/ListKit';
import { formatPhone } from '@/lib/format';
import { uid } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useActivityStore } from '@/stores/activityStore';
import { useAgentStore } from '@/stores/agentStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useRecordsStore } from '@/stores/recordsStore';
import { useActor, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';

/** Names for ids, scoped to the current company. */
export function useLookups() {
  const users = useAccessStore((s) => s.users);
  const agents = useOrgRows(useAgentStore((s) => s.agents));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const settings = useOrgSettings();
  const lang = useLang();
  return useMemo(() => {
    const userName = new Map(users.map((u) => [u.id, u.name]));
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const communityById = new Map(communities.map((c) => [c.id, c]));
    return {
      user: (id: string) => userName.get(id) ?? (id === 'system' ? '—' : id),
      agent: (id?: string) => (id ? userName.get(agentById.get(id)?.userId ?? '') ?? '—' : '—'),
      agentUserId: (id?: string) => (id ? agentById.get(id)?.userId : undefined),
      community: (id?: string) => (id ? communityById.get(id)?.name ?? '—' : '—'),
      commodity: (id: string) => {
        const c = settings.commodities.find((x) => x.id === id);
        return c ? c.name[lang] ?? c.name.en ?? c.code : id;
      },
      agents,
      communities,
    };
  }, [users, agents, communities, settings.commodities, lang]);
}

/** Structured activity for a record, rendered in the viewer's language (PRD 8.14). */
export function ActivityFeed({ entity, entityId }: { entity: string; entityId: string }) {
  const all = useActivityStore((s) => s.activity);
  const lk = useLookups();
  const { t } = useT();
  const f = useFormat();
  const rows = useMemo(() => all.filter((e) => e.entity === entity && e.entityId === entityId).sort((a, b) => b.at.localeCompare(a.at)), [all, entity, entityId]);
  const lang = useLang();
  // Money params are stored as { amountMinor, currency }, names per language as { en, fr }, dates as
  // YYYY-MM-DD; each is shown in the viewer's language and the company's format.
  const one = (k: string, v: unknown) => {
    if (v && typeof v === 'object' && 'amountMinor' in v) return f.money(v as Money);
    if (v && typeof v === 'object' && ('en' in v || 'fr' in v)) { const n = v as Partial<Record<string, string>>; return n[lang] ?? n.en ?? n.fr; }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return f.date(v);
    return k === 'method' && typeof v === 'string' ? t(`activity.method.${v}`, { defaultValue: v }) : v;
  };
  const params = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, one(k, v)]));
  if (!rows.length) return <TabEmpty>{t('people.noActivity')}</TabEmpty>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {rows.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" aria-hidden="true" />
          <div className="text-[14px] text-ink">{t(`activity.${e.key}`, params(e.params))}</div>
          <div className="text-[12px] text-muted">{lk.user(e.actorId)} · {f.dateTime(e.at)}{e.meta?.device ? ` · ${t(`people.device.${e.meta.device}`, { defaultValue: e.meta.device })}` : ''}</div>
        </li>
      ))}
    </ol>
  );
}

export function logActivity(orgId: string, entity: string, entityId: string, key: string, params: Record<string, unknown>, actorId: string) {
  useActivityStore.getState().log(makeEvent(orgId, entity, entityId, key, params, actorId, { device: 'web' }));
}

/** Documents tab: type from the company list, upload with preview, uploaded by/when (PRD C2, C4). */
export function DocumentsPanel({ entity, entityId, types, permission, onUploaded }: { entity: RecordDocument['entity']; entityId: string; types: string[]; permission: string; onUploaded?: (d: RecordDocument) => void }) {
  const all = useRecordsStore((s) => s.documents);
  const docs = useMemo(() => all.filter((d) => d.entity === entity && d.entityId === entityId), [all, entity, entityId]);
  const { orgId, userId } = useActor();
  const lk = useLookups();
  const { t } = useT();
  const f = useFormat();
  const [type, setType] = useState(types[0] ?? 'other');
  const [preview, setPreview] = useState<RecordDocument | null>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const add = (dataUrl?: string) => {
      const d: RecordDocument = { id: uid('doc'), orgId, entity, entityId, type, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl, uploadedBy: userId ?? 'system', uploadedAt: new Date().toISOString() };
      useRecordsStore.getState().addDocument(d);
      logActivity(orgId, entity, entityId, 'record.documentAdded', { name: file.name, type: t(`people.docType.${type}`) }, userId ?? 'system');
      toast.success(t('people.uploaded', { name: file.name }));
      onUploaded?.(d);
    };
    // Keep small files so they can be previewed; larger ones keep their metadata only.
    if (file.size <= 400_000) {
      const r = new FileReader();
      r.onload = () => add(String(r.result));
      r.readAsDataURL(file);
    } else add();
  };

  return (
    <div className="space-y-4">
      <PermissionGate permission={permission}>
        <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line p-3">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('people.docTypeLabel')} className="h-10 rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
            {types.map((x) => <option key={x} value={x}>{t(`people.docType.${x}`)}</option>)}
          </select>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-ctl bg-brand px-4 text-[14px] font-medium text-on-brand hover:bg-brand-hover">
            <Upload className="h-4 w-4" /> {t('people.upload')}
            <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={onFile} />
          </label>
        </div>
      </PermissionGate>
      {!docs.length ? (
        <TabEmpty>{t('people.noDocuments')}</TabEmpty>
      ) : (
        <ul className="divide-y divide-line rounded-ctl border border-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              {d.dataUrl && d.mime.startsWith('image/') ? <img src={d.dataUrl} alt="" className="h-10 w-10 rounded-[8px] object-cover" /> : <FileText className="h-8 w-8 shrink-0 text-muted" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setPreview(d)} className="block max-w-full truncate text-left text-[14px] font-medium text-ink hover:text-brand">{d.name}</button>
                <div className="text-[12px] text-muted">{t(`people.docType.${d.type}`, { defaultValue: d.type })} · {t('people.kb', { n: f.number(Math.round(d.size / 1024)) })} · {lk.user(d.uploadedBy)} · {f.date(d.uploadedAt)}</div>
              </div>
              <PermissionGate permission={permission}>
                <Button variant="ghost" size="iconSm" aria-label={t('set.remove')} onClick={() => useRecordsStore.getState().removeDocument(d.id)}><Trash2 /></Button>
              </PermissionGate>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="truncate">{preview?.name}</DialogTitle></DialogHeader>
          {preview?.dataUrl && preview.mime.startsWith('image/') ? (
            <img src={preview.dataUrl} alt={preview.name} className="max-h-[60vh] w-full rounded-ctl object-contain" />
          ) : preview?.dataUrl && preview.mime === 'application/pdf' ? (
            <iframe title={preview.name} src={preview.dataUrl} className="h-[60vh] w-full rounded-ctl border border-line" />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-ctl bg-canvas py-12 text-center text-[14px] text-muted">
              <FileText className="h-10 w-10" />
              {t('people.previewUnavailable')}
            </div>
          )}
          <DialogFooter>
            {preview?.dataUrl && <Button variant="secondary" asChild><a href={preview.dataUrl} download={preview.name}><Download /> {t('people.download')}</a></Button>}
            <Button onClick={() => setPreview(null)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Leaders tab: name, role (company list), phone; add / edit / remove. */
export function LeadersPanel({ entity, entityId, roles, permission }: { entity: Leader['entity']; entityId: string; roles: string[]; permission: string }) {
  const all = useRecordsStore((s) => s.leaders);
  const leaders = useMemo(() => all.filter((l) => l.entity === entity && l.entityId === entityId), [all, entity, entityId]);
  const { orgId, userId } = useActor();
  const { t } = useT();
  const [edit, setEdit] = useState<Leader | null>(null);
  const roleLabel = (r: string) => t(`people.leaderRole.${r}`, { defaultValue: r });
  const save = () => {
    if (!edit || !edit.name.trim()) return;
    useRecordsStore.getState().saveLeader({ ...edit, name: edit.name.trim() });
    logActivity(orgId, entity, entityId, 'record.leaderSaved', { name: edit.name.trim(), role: roleLabel(edit.role) }, userId ?? 'system');
    setEdit(null);
  };
  return (
    <div className="space-y-3">
      <PermissionGate permission={permission}>
        <Button variant="secondary" size="sm" onClick={() => setEdit({ id: uid('ld'), orgId, entity, entityId, name: '', role: roles[0] ?? '', phone: '', createdAt: new Date().toISOString() })}><Plus /> {t('people.addLeader')}</Button>
      </PermissionGate>
      {!leaders.length ? (
        <TabEmpty>{t('people.noLeaders')}</TabEmpty>
      ) : (
        <ul className="divide-y divide-line rounded-ctl border border-line">
          {leaders.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-ink">{l.name}</div>
                <div className="text-[12px] text-muted">{roleLabel(l.role)} · {formatPhone(l.phone) || '—'}</div>
              </div>
              <PermissionGate permission={permission}>
                <Button variant="ghost" size="iconSm" aria-label={t('people.edit')} onClick={() => setEdit(l)}><Pencil /></Button>
              </PermissionGate>
              <PermissionGate permission={permission}>
                <Button variant="ghost" size="iconSm" aria-label={t('set.remove')} onClick={() => useRecordsStore.getState().removeLeader(l.id)}><Trash2 /></Button>
              </PermissionGate>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('people.leader')}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <Input compact value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t('people.name')} aria-label={t('people.name')} autoFocus />
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} aria-label={t('people.role')} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink">
                {[...new Set([...roles, edit.role])].map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
              <Input compact type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder={t('people.phone')} aria-label={t('people.phone')} />
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={!edit?.name.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Score with its breakdown by component (scoring engine). */
export function ScoreView({ model, breakdown, prefix, onRecalculate, stored }: { model: ScoreModel; breakdown: ScoreBreakdown; prefix: string; onRecalculate?: () => void; stored?: number }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="tnum text-[40px] font-semibold leading-none text-ink">{f.number(breakdown.total, { maximumFractionDigits: 1 })}</span>
          <span className="ml-1 text-muted">{'/ 100'}</span>
          {stored != null && Math.round(stored) !== Math.round(breakdown.total) && <p className="mt-1 text-[12px] text-muted">{t('people.storedScore', { score: stored })}</p>}
        </div>
        {onRecalculate && <Button variant="secondary" size="sm" onClick={onRecalculate}>{t('people.recalculate')}</Button>}
      </div>
      <ul className="space-y-2.5">
        {model.components.map((c) => {
          const p = breakdown.parts.find((x) => x.componentId === c.id)!;
          return (
            <li key={c.id}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-body">{t(`${prefix}.${c.name}`)}{p.needsReview && <Badge tone="warning" className="ml-2">{t('people.needsReview')}</Badge>}</span>
                <span className="tnum font-medium text-ink">{f.number(p.points, { maximumFractionDigits: 1 })} / {c.weight}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(p.points / c.weight) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-muted">{t('people.scoreModel', { version: model.version })}</p>
    </div>
  );
}
