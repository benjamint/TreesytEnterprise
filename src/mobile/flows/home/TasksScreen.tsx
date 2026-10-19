import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ListTodo, ShieldAlert } from 'lucide-react';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useFormat, useT } from '@/stores/hooks';

/** M2 Tasks: everything assigned to the agent. Phase 5 adds data-quality fixes from the web. */
export function TasksScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { agent } = useMobileAgent();
  const tasks = useQualityStore((s) => s.tasks);
  const farmers = useFarmerStore((s) => s.farmers);
  const communities = useCommunityStore((s) => s.communities);
  const mine = useMemo(() => tasks.filter((x) => x.agentId === agent?.id).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'OPEN' ? -1 : 1)), [tasks, agent?.id]);
  const name = (entity: string, id: string) => {
    if (entity === 'farmer') { const x = farmers.find((y) => y.id === id); return x ? `${x.firstName} ${x.lastName}` : id; }
    return communities.find((c) => c.id === id)?.name ?? id;
  };
  const open = mine.filter((x) => x.status === 'OPEN');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.tasksTitle')} />
      {!mine.length ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand"><ListTodo className="h-6 w-6" aria-hidden="true" /></span>
          <p className="text-[15px] text-muted">{t('mobile.tasksEmpty')}</p>
        </div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-2">
          <section>
            <h2 className="eyebrow mb-2">{t('mobile.fix.openTasks', { count: open.length })}</h2>
            {open.length ? (
              <ul className="divide-y divide-line rounded-card border border-line">
                {open.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => navigate(`/m/tasks/${x.id}`)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left active:bg-brand-soft">
                      <ShieldAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{t('mobile.fix.taskTitle', { name: name(x.entity, x.recordId) })}</span>
                        <span className="block text-[13px] text-muted">{t('mobile.fix.issues', { count: x.issueIds.length })} · {f.relative(x.createdAt)}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[14px] text-muted">{t('mobile.fix.allDone')}</p>}
          </section>
          {mine.some((x) => x.status === 'DONE') && (
            <section>
              <h2 className="eyebrow mb-2">{t('mobile.fix.done')}</h2>
              <ul className="divide-y divide-line rounded-card border border-line">
                {mine.filter((x) => x.status === 'DONE').slice(0, 10).map((x) => (
                  <li key={x.id} className="px-4 py-3 text-[14px]">
                    <span className="block text-ink">{t('mobile.fix.taskTitle', { name: name(x.entity, x.recordId) })}</span>
                    <span className="block text-[13px] text-muted">{x.doneAt ? f.relative(x.doneAt) : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
