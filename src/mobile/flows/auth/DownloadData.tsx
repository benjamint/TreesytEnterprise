import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { LogoBadge } from '@/components/shared/Logo';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormStore } from '@/stores/formStore';
import { useGroupStore } from '@/stores/groupStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/stores/hooks';

/** M1 "download data" screen: progress per module, then on (also used when switching company). */
export function DownloadData({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { t } = useT();
  const count = <T extends { orgId: string }>(rows: T[]) => rows.filter((r) => r.orgId === orgId).length;
  const communities = useCommunityStore((s) => s.communities);
  const farmers = useFarmerStore((s) => s.farmers);
  const groups = useGroupStore((s) => s.groups);
  const requests = useBuyingStore((s) => s.requests);
  const forms = useFormStore((s) => s.forms);
  const prices = useSettingsStore((s) => s.settings[orgId]?.priceList.length ?? 0);
  const rows = useMemo(() => [
    ['communities', count(communities)], ['farmers', count(farmers)], ['groups', count(groups)], ['requests', count(requests)], ['forms', count(forms)], ['prices', prices],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ] as const, [orgId]);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setProgress((p) => Math.min(rows.length, p + 0.25)), 110);
    return () => window.clearInterval(id);
  }, [rows.length]);
  useEffect(() => { if (progress >= rows.length) { const id = window.setTimeout(onDone, 400); return () => window.clearTimeout(id); } return undefined; }, [progress, rows.length, onDone]);
  return (
    <div className="flex h-full flex-col justify-center gap-6 px-7">
      <LogoBadge size={44} />
      <div>
        <h1 className="text-[24px]">{t('mobile.m1.downloadTitle')}</h1>
        <p className="mt-1 text-[15px] text-muted">{t('mobile.m1.downloadBody')}</p>
      </div>
      <ul className="space-y-3" aria-live="polite">
        {rows.map(([key, n], i) => {
          const pct = Math.max(0, Math.min(1, progress - i));
          return (
            <li key={key}>
              <div className="mb-1 flex items-center justify-between text-[14px]">
                <span className="flex items-center gap-2 text-ink">{pct >= 1 ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Loader2 className="h-4 w-4 animate-spin text-muted" />}{t(`mobile.m1.module.${key}`)}</span>
                <span className="tnum text-muted">{Math.round(n * pct)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct * 100}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
