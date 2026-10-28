import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import type { JobRun } from '@/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { JOBS, nextRun, runNow, type JobDef, type JobKey, type JobSchedule } from '@/services/jobScheduler';
// Job bodies register themselves when their services load.
import '@/services/teamService';
import '@/services/systemService';
import '@/services/reportService';
import { useSystemStore } from '@/stores/systemStore';
import { useActor, useCurrentOrg, useFormat, useModules, useT } from '@/stores/hooks';
import { SysStatus, useUserName } from './shared';

type TFn = ReturnType<typeof useT>['t'];
function scheduleText(s: JobSchedule, t: TFn) {
  if (s.every === 'MINUTES') return t('jobs.every.minutes', { count: s.minutes });
  if (s.every === 'HOURLY') return t('jobs.every.hourly', { minute: String(s.minute).padStart(2, '0') });
  if (s.every === 'DAILY') return t('jobs.every.daily', { time: s.time });
  if (s.every === 'WEEKLY') return t('jobs.every.weekly', { day: t(`common.weekday.${s.weekday}`), time: s.time });
  return t('jobs.every.monthly', { day: s.day, time: s.time });
}

interface JobRow extends JobDef { last?: JobRun; next: string; runs: JobRun[] }

/** Scheduled jobs (PRD K6): schedule in the company time zone, last and next run, status, duration, Run now, log. */
export function JobsPage() {
  const { t } = useT();
  const f = useFormat();
  const org = useCurrentOrg();
  const modules = useModules();
  const { orgId, userId } = useActor();
  const runs = useSystemStore((s) => s.jobRuns);
  const [running, setRunning] = useState<JobKey | null>(null);
  const [openId, open, close] = useDrawerParam('job');
  useDemoNotes([{ id: 'jobs', key: 'demo.note.jobs' }]);
  const platform = org.type === 'PLATFORM';
  const rows = useMemo<JobRow[]>(() => JOBS.filter((j) => (j.platformOnly ? platform : !platform && (!j.module || modules[j.module] !== false))).map((j) => {
    const mine = runs.filter((r) => r.key === j.key && (j.platformOnly || r.orgId === orgId));
    return { ...j, runs: mine, last: mine[0], next: nextRun(j.schedule, org.timezone).toISOString() };
  }), [runs, orgId, org.timezone, modules, platform]);
  const run = async (key: JobKey) => {
    setRunning(key);
    const r = await runNow(key, { orgId: platform ? undefined : orgId, by: userId ?? 'system' });
    setRunning(null);
    if (r.ok) toast.success(t('jobs.done', { name: t(`jobs.name.${key}`), ms: r.ms }));
    else toast.error(t('jobs.failed', { name: t(`jobs.name.${key}`) }));
  };
  const columns = useMemo<ColumnDef<JobRow, unknown>[]>(() => [
    { id: 'name', header: t('jobs.col.job'), accessorFn: (j) => t(`jobs.name.${j.key}`), cell: (c) => <span><span className="block font-medium text-ink">{c.getValue() as string}</span><span className="block text-[12px] text-muted">{t(`jobs.desc.${c.row.original.key}`)}</span></span> },
    { id: 'schedule', header: t('jobs.col.schedule'), accessorFn: (j) => scheduleText(j.schedule, t) },
    { id: 'last', header: t('jobs.col.last'), accessorFn: (j) => j.last?.startedAt ?? '', cell: (c) => (c.getValue() ? f.dateTime(c.getValue() as string) : '—') },
    { id: 'next', header: t('jobs.col.next'), accessorKey: 'next', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorFn: (j) => j.last?.status ?? '', cell: (c) => (c.getValue() ? <SysStatus status={c.getValue() as string} /> : '—') },
    { id: 'ms', header: t('jobs.col.duration'), accessorFn: (j) => j.last?.ms ?? 0, cell: (c) => (c.row.original.last ? <span className="tnum">{c.row.original.last.ms >= 1000 ? `${(c.row.original.last.ms / 1000).toFixed(1)} s` : `${c.row.original.last.ms} ms`}</span> : '—') },
    {
      id: 'run', header: '', enableSorting: false, cell: (c) => (
        <PermissionGate permission="jobs.run">
          <Button size="sm" variant="secondary" disabled={running !== null} onClick={(e) => { e.stopPropagation(); void run(c.row.original.key); }} aria-label={t('jobs.runNamed', { name: t(`jobs.name.${c.row.original.key}`) })}>
            <Play className={running === c.row.original.key ? 'animate-pulse' : ''} /> {running === c.row.original.key ? t('jobs.running') : t('jobs.runNow')}
          </Button>
        </PermissionGate>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, running]);
  const current = rows.find((j) => j.key === openId);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.system')} title={t('nav.jobs')} description={t('jobs.description', { tz: org.timezone })} />
      <DataTable columns={columns} data={rows} onRowClick={(j) => open(j.key)} activeId={openId} getRowId={(j) => j.key} pageSize={12} />
      {current && <JobDrawer key={current.key} j={current} onClose={close} />}
    </>
  );
}

function JobDrawer({ j, onClose }: { j: JobRow; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const userName = useUserName();
  const org = useCurrentOrg();
  return (
    <DetailDrawer open onClose={onClose} title={t(`jobs.name.${j.key}`)} subtitle={scheduleText(j.schedule, t)} badges={j.last ? <SysStatus status={j.last.status} /> : undefined}
      tabs={[
        {
          key: 'log', label: t('jobs.tab.log'), content: (
            <div className="space-y-4">
              <Facts items={[[t('jobs.col.next'), `${f.dateTime(j.next)} (${org.timezone})`], [t('jobs.runsKept'), f.number(j.runs.length)]]} />
              {j.runs.length ? (
                <ol className="space-y-3">
                  {j.runs.slice(0, 20).map((r) => (
                    <li key={r.id} className="rounded-ctl border border-line p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="font-medium text-ink">{f.dateTime(r.startedAt)}</span>
                        <SysStatus status={r.status} />
                        <span className="text-muted">{`${r.ms >= 1000 ? `${(r.ms / 1000).toFixed(1)} s` : `${r.ms} ms`} · ${r.by === 'system' ? t('jobs.bySchedule') : t('jobs.byUser', { name: userName(r.by) })}`}</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-[12px] text-body">{r.log.length ? r.log.join('\n') : t('jobs.noOutput')}</pre>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-[13px] text-muted">{t('jobs.noRuns')}</p>}
            </div>
          ),
        },
      ]} />
  );
}
