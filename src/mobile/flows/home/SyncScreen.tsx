import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useDemoActions, useDemoNotes } from '@/components/shared/useDemoNotes';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { payloadKb, resolveConflict, serverVersionOf, syncOutbox, type SyncResult } from '@/services/mobileSync';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormat, useT } from '@/stores/hooks';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore, type OutboxItem } from '@/stores/outboxStore';
import { useSystemStore } from '@/stores/systemStore';
import { demoDeviceId, installUpdate, syncBlock } from '@/services/systemService';

/** M2 Sync: outbox by type, Sync now with per-item results, conflicts (Keep mine / Keep server), offline toggle. */
export function SyncScreen() {
  const { online, setOnline, lastSyncAt, userId, orgId } = useMobileSessionStore();
  useSystemStore((s) => s.devices.find((d) => d.id === demoDeviceId(userId ?? '')));
  const blocked = userId && orgId ? syncBlock(userId, orgId) : undefined;
  const allItems = useOutboxStore((s) => s.items);
  const items = useMemo(() => allItems.filter((i) => i.userId === userId), [allItems, userId]);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[]>([]);
  const f = useFormat();
  const { t } = useT();
  const byType = useMemo(() => { const m = new Map<string, number>(); for (const i of items) m.set(i.type, (m.get(i.type) ?? 0) + 1); return [...m]; }, [items]);
  const conflicts = items.filter((i) => i.status === 'conflict');
  useDemoNotes([{ id: 'sync', key: 'demo.note.mobileSync' }]);
  // Demo: an office user edits the same record, so the next sync shows a conflict.
  const edit = items.find((i) => i.base && i.status !== 'conflict');
  const demo = useMemo(() => (edit ? [{ id: 'conflict', key: 'demo.action.officeEdit', params: { label: edit.label }, run: () => bumpServer(edit) }] : []), [edit]);
  useDemoActions(demo);

  const syncNow = async () => {
    if (!userId) return;
    setSyncing(true);
    setResults([]);
    let out: SyncResult[];
    try {
      out = await syncOutbox(userId, (r) => setResults((rs) => [...rs, r]));
    } catch (e) {
      setSyncing(false);
      toast.error(t(`mobile.sync.blocked.${(e as Error).message}`, { defaultValue: (e as Error).message }));
      return;
    }
    setSyncing(false);
    const ok = out.filter((r) => r.outcome === 'synced').length;
    if (out.some((r) => r.outcome !== 'synced')) toast.warning(t('mobile.sync.partial', { ok, total: out.length }));
    else toast.success(out.length ? t('mobile.sync.done', { count: ok }) : t('mobile.synced'));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.syncTitle')} />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-2">
        <div className="rounded-card border border-line p-5 text-center">
          <motion.div animate={syncing ? { rotate: 360 } : { rotate: 0 }} transition={syncing ? { repeat: Infinity, duration: 1, ease: 'linear' } : {}} className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
            {items.length === 0 && !syncing ? <CheckCircle2 className="h-7 w-7" aria-hidden="true" /> : <RefreshCw className="h-7 w-7" aria-hidden="true" />}
          </motion.div>
          <p className="font-semibold text-ink">{items.length ? t('mobile.outboxCount', { count: items.length }) : t('mobile.synced')}</p>
          <p className="mt-1 text-[14px] text-muted">{lastSyncAt ? t('mobile.lastSync', { when: f.relative(lastSyncAt) }) : t('mobile.neverSynced')}</p>
          {items.length > 0 && <p className="mt-1 text-[13px] text-muted">{t('mobile.sync.dataUsage', { kb: payloadKb(items) })}</p>}
        </div>

        {byType.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {byType.map(([type, n]) => <Badge key={type} tone="neutral">{`${t(`mobile.sync.type.${type}`)} · ${n}`}</Badge>)}
          </div>
        )}

        {blocked && (
          <div className="rounded-card border border-danger/40 bg-danger/5 p-4" role="alert">
            <div className="flex items-start gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /><div className="flex-1"><div className="font-semibold text-ink">{t(`mobile.sync.blocked.${blocked}`)}</div><p className="text-[14px] text-body">{t(`mobile.sync.blockedHint.${blocked}`)}</p></div></div>
            <Button className="mt-3 w-full" onClick={() => { if (blocked === 'updateRequired') { installUpdate(demoDeviceId(userId!)); toast.success(t('mobile.sync.updated')); } else useMobileSessionStore.getState().signOut(); }}>
              {t(blocked === 'updateRequired' ? 'mobile.sync.installUpdate' : 'mobile.sync.signInAgain')}
            </Button>
          </div>
        )}

        {conflicts.map((c) => <ConflictCard key={c.id} item={c} />)}

        {results.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2">{t('mobile.sync.results')}</h2>
            <ul className="divide-y divide-line rounded-card border border-line">
              {results.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 text-[14px]">
                  {r.outcome === 'synced' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : r.outcome === 'conflict' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <span className="flex-1 text-ink">{r.label}{r.error && <span className="block text-[12px] text-danger">{r.error}</span>}</span>
                  <span className="text-[12px] text-muted">{t(`mobile.sync.outcome.${r.outcome}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {items.filter((i) => i.status !== 'conflict').length === 0 && !results.length ? (
          <p className="text-center text-[14px] text-muted">{t('mobile.outboxEmpty')}</p>
        ) : items.some((i) => i.status !== 'conflict') && (
          <section>
            <h2 className="eyebrow mb-2">{t('mobile.sync.waiting')}</h2>
            <ul className="divide-y divide-line rounded-card border border-line">
              {items.filter((i) => i.status !== 'conflict').map((i) => (
                <li key={i.id} className="px-4 py-3 text-[14px]">
                  <span className="block text-ink">{i.label}</span>
                  <span className="block text-[12px] text-muted">{t(`mobile.sync.type.${i.type}`)} · {f.relative(i.createdAt)}{i.status === 'error' ? ` · ${i.error}` : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <label className="flex items-center gap-4 rounded-card border border-line p-4">
          <span className="flex-1">
            <span className="block font-medium text-ink">{t('mobile.workOffline')}</span>
            <span className="block text-[13px] text-muted">{t('mobile.workOfflineHint')}</span>
          </span>
          <Switch checked={!online} onCheckedChange={(v) => setOnline(!v)} aria-label={t('mobile.workOffline')} />
        </label>
      </div>
      <div className="shrink-0 border-t border-line p-4">
        <Button size="lg" className="w-full" onClick={() => void syncNow()} disabled={syncing || !online || !items.some((i) => i.status !== 'conflict')}>
          <RefreshCw className={syncing ? 'animate-spin' : ''} /> {online ? t('mobile.syncNow') : t('mobile.sync.goOnline')}
        </Button>
      </div>
    </div>
  );
}

function ConflictCard({ item }: { item: OutboxItem }) {
  const { t } = useT();
  const f = useFormat();
  const choose = async (c: 'mine' | 'server') => { await resolveConflict(item.id, c); toast.success(t(c === 'mine' ? 'mobile.sync.keptMine' : 'mobile.sync.keptServer')); };
  return (
    <div className="rounded-card border border-warning/40 bg-warning/5 p-4" role="alert">
      <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><div className="font-semibold text-ink">{t('mobile.sync.conflictTitle')}</div><p className="text-[14px] text-body">{t('mobile.sync.conflictBody', { label: item.label, when: f.relative(serverVersionOf(item) ?? item.base?.updatedAt ?? item.createdAt) })}</p></div></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void choose('server')}>{t('mobile.sync.keepServer')}</Button>
        <Button onClick={() => void choose('mine')}>{t('mobile.sync.keepMine')}</Button>
      </div>
    </div>
  );
}

/** Simulate someone in the office saving the same record after the phone read it. */
function bumpServer(item: OutboxItem) {
  const at = new Date().toISOString();
  if (item.base?.entity === 'farmer') useFarmerStore.getState().updateFarmers([item.base.id], () => ({ updatedAt: at }));
  if (item.base?.entity === 'community') {
    const c = useCommunityStore.getState().communities.find((x) => x.id === item.base!.id);
    if (c) useCommunityStore.getState().saveCommunity({ ...c, updatedAt: at });
  }
}
