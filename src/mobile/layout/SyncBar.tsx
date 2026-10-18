import { Link } from 'react-router-dom';
import { CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFormat, useT } from '@/stores/hooks';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore } from '@/stores/outboxStore';

/** Sync status bar: online/offline, last sync and items waiting (PRD 10 common components). */
export function SyncBar() {
  const { online, lastSyncAt, userId } = useMobileSessionStore();
  const pending = useOutboxStore((s) => s.items.filter((i) => i.userId === userId).length);
  const f = useFormat();
  const { t } = useT();
  return (
    <Link to="/m/sync" className={cn('flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium', online ? 'bg-brand-soft text-brand' : 'bg-warning/10 text-warning')}>
      {online ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="whitespace-nowrap">{online ? t('mobile.online') : t('mobile.offline')}</span>
      <span aria-hidden="true">·</span>
      <span className="truncate font-normal">{pending ? t('mobile.outboxCount', { count: pending }) : lastSyncAt ? t('mobile.lastSync', { when: f.relative(lastSyncAt) }) : t('mobile.neverSynced')}</span>
    </Link>
  );
}

export function OfflineBanner() {
  const online = useMobileSessionStore((s) => s.online);
  const { t } = useT();
  if (online) return null;
  return (
    <div className="flex items-start gap-2 bg-warning/10 px-5 py-2.5 text-[13px] text-warning" role="status">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t('mobile.offlineBanner')}</span>
    </div>
  );
}
