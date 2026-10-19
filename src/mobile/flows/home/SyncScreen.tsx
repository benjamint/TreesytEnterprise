import { useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { latency } from '@/lib/utils';
import { useFormat, useT } from '@/stores/hooks';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useOutboxStore } from '@/stores/outboxStore';
import type { SurveyResponse } from '@/types';
import { applyFix } from '@/services/qualityService';
import { fillSchema, getLiveForm, submitResponse } from '@/services/formService';
import { registerFarmer, type FarmerCore } from '@/services/farmerService';
import { useFormStore } from '@/stores/formStore';

/** M2 Sync (phase 1 version): outbox, Sync now, offline toggle. Item-by-item sync arrives in phase 9. */
export function SyncScreen() {
  const { online, setOnline, lastSyncAt, markSynced, userId } = useMobileSessionStore();
  const allItems = useOutboxStore((s) => s.items);
  const items = useMemo(() => allItems.filter((i) => i.userId === userId), [allItems, userId]);
  const [syncing, setSyncing] = useState(false);
  const f = useFormat();
  const { t } = useT();

  const syncNow = async () => {
    setSyncing(true);
    await latency(800, 1400);
    // Data-quality fixes saved offline are applied on sync (other item types arrive in phase 9).
    const fixes = items.filter((i) => i.type === 'qualityFix');
    for (const i of fixes) {
      const p = i.payload as { taskId: string; values: Record<string, unknown> };
      applyFix(p.taskId, p.values, i.userId, 'mobile');
    }
    if (fixes.length) useOutboxStore.getState().remove(fixes.map((i) => i.id));
    // Surveys and registrations captured offline (Phase 6).
    const done: string[] = [];
    for (const i of items.filter((x) => x.type === 'survey' || x.type === 'farmer')) {
      if (i.type === 'survey') {
        const p = i.payload as { formId: string; answers: Record<string, unknown>; subject?: SurveyResponse['subject']; gps?: SurveyResponse['gps']; startedAt?: string; agentId?: string };
        const form = useFormStore.getState().forms.find((f) => f.id === p.formId);
        if (!form) continue;
        submitResponse({ form, schema: fillSchema(form, useFormStore.getState().optionLists), answers: p.answers, userId: i.userId, agentId: p.agentId, subject: p.subject, gps: p.gps, startedAt: p.startedAt, device: 'mobile' });
      } else {
        const p = i.payload as { core: FarmerCore; answers: Record<string, unknown>; agentId?: string };
        registerFarmer(i.orgId, i.userId, p.core, getLiveForm(i.orgId, 'farmerProfile'), p.answers, { agentId: p.agentId });
      }
      done.push(i.id);
    }
    if (done.length) useOutboxStore.getState().remove(done);
    markSynced();
    setSyncing(false);
    toast.success(t('mobile.synced'));
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
        </div>
        {items.length === 0 ? (
          <p className="text-center text-[14px] text-muted">{t('mobile.outboxEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line">
            {items.map((i) => (
              <li key={i.id} className="px-4 py-3 text-[14px] text-ink">{i.label}</li>
            ))}
          </ul>
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
        <Button size="lg" className="w-full" onClick={syncNow} disabled={syncing || !online}>
          <RefreshCw /> {t('mobile.syncNow')}
        </Button>
      </div>
    </div>
  );
}
