import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, EyeOff, LogOut, Smartphone, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { Device, SyncLog } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { ChartFrame, HBars } from '@/components/charts/charts';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { SYNC_TYPES } from '@/data/catalogs/syncTypes';
import { belowMinimum, devicesOf, maskPersonal, requireUpdate, retentionSummary, RETRY_GUIDANCE, signOutDevice, versionCounts } from '@/services/systemService';
import { saveSettings } from '@/services/settingsService';
import { runNow } from '@/services/jobScheduler';
import { useSystemStore } from '@/stores/systemStore';
import { useActor, useCan, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { JsonBlock, SysStatus, useUserName } from './shared';

/** Sync logs and devices (PRD K3): every phone sync by type, the devices behind them, app versions and retention. */
export function SyncPage() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') ?? 'logs';
  useDemoNotes([{ id: 'sync', key: 'demo.note.syncLogs' }]);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.system')} title={t('nav.sync')} description={t('pages.sync')} />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'logs' ? {} : { view: v })}>
        <TabsList>
          <TabsTrigger value="logs">{t('sync.tab.logs')}</TabsTrigger>
          <TabsTrigger value="devices">{t('sync.tab.devices')}</TabsTrigger>
          <TabsTrigger value="versions">{t('sync.tab.versions')}</TabsTrigger>
          <TabsTrigger value="types">{t('sync.tab.types')}</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="mt-5"><Logs /></TabsContent>
        <TabsContent value="devices" className="mt-5"><Devices /></TabsContent>
        <TabsContent value="versions" className="mt-5"><Versions /></TabsContent>
        <TabsContent value="types" className="mt-5"><Types /></TabsContent>
      </Tabs>
    </>
  );
}

const typeLabel = (t: ReturnType<typeof useT>['t'], k: string) => t(`sync.type.${k}`);

function Logs() {
  const { t } = useT();
  const f = useFormat();
  const userName = useUserName();
  const rows = useOrgRows(useSystemStore((s) => s.syncLogs));
  const devices = useSystemStore((s) => s.devices);
  const [openId, open, close] = useDrawerParam('log');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [days, setDays] = useState('7');
  const since = days ? new Date(Date.now() - Number(days) * 86_400_000).toISOString() : '';
  const query = q.trim().toLowerCase();
  const inRange = rows.filter((l) => !since || l.at >= since);
  const shown = inRange.filter((l) => (!status || l.status === status) && (!type || l.type === type) && (!query || `${userName(l.userId)} ${l.appVersion} ${l.error ?? ''}`.toLowerCase().includes(query)));
  const devName = (id?: string) => devices.find((d) => d.id === id)?.model ?? '—';
  const columns = useMemo<ColumnDef<SyncLog, unknown>[]>(() => [
    { id: 'at', header: t('sync.col.time'), accessorKey: 'at', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'agent', header: t('col.agent'), accessorFn: (l) => userName(l.userId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'device', header: t('sync.col.device'), accessorFn: (l) => devName(l.deviceId) },
    { id: 'version', header: t('sync.col.version'), accessorKey: 'appVersion', cell: (c) => <span className="font-mono text-[12px]">{c.getValue() as string}</span> },
    { id: 'type', header: t('sync.col.type'), accessorFn: (l) => typeLabel(t, l.type) },
    { id: 'sent', header: t('sync.col.sent'), accessorKey: 'sent', cell: (c) => <span className="tnum">{f.number(c.getValue() as number)}</span> },
    { id: 'result', header: t('sync.col.result'), accessorFn: (l) => `${l.created}/${l.updated}/${l.failed}`, cell: (c) => { const l = c.row.original; return <span className="tnum text-[13px]">{`${f.number(l.created)} · ${f.number(l.updated)} · `}<span className={l.failed ? 'font-semibold text-danger' : ''}>{f.number(l.failed)}</span></span>; } },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <SysStatus status={c.getValue() as string} /> },
    { id: 'ms', header: t('sync.col.duration'), accessorKey: 'ms', cell: (c) => <span className="tnum">{`${(Number(c.getValue()) / 1000).toFixed(1)} s`}</span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, userName, devices]);
  const current = rows.find((l) => l.id === openId);
  const failed = inRange.filter((l) => l.status === 'FAILED').length;
  const partial = inRange.filter((l) => l.status === 'PARTIAL').length;
  return (
    <>
      <div className="mb-5 stat-strip grid gap-3 sm:grid-cols-4">
        <StatCard label={t('sync.stat.syncs')} value={f.number(inRange.length)} hint={t('sync.stat.agents', { count: new Set(inRange.map((l) => l.userId)).size })} />
        <StatCard label={t('sync.stat.records')} value={f.number(inRange.reduce((s, l) => s + l.sent, 0))} />
        <StatCard label={t('sys.status.PARTIAL')} value={f.number(partial)} onClick={() => setStatus('PARTIAL')} />
        <StatCard label={t('sys.status.FAILED')} value={f.number(failed)} icon={TriangleAlert} onClick={() => setStatus('FAILED')} />
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('sync.search')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: inRange.length }, ...(['SUCCESS', 'PARTIAL', 'FAILED'] as const).map((s) => ({ key: s, label: t(`sys.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: inRange.filter((l) => l.status === s).length }))]}
        filters={[
          { key: 'type', label: t('sync.col.type'), value: type, onChange: setType, options: SYNC_TYPES.map((k) => ({ value: k, label: typeLabel(t, k) })) },
          { key: 'days', label: t('sync.period'), value: days, onChange: setDays, options: [{ value: '1', label: t('sync.last24h') }, { value: '7', label: t('sync.lastDays', { count: 7 }) }, { value: '30', label: t('sync.lastDays', { count: 30 }) }, { value: '90', label: t('sync.lastDays', { count: 90 }) }] },
        ]}
        onClear={() => { setQ(''); setStatus(''); setType(''); setDays('7'); }} />
      <DataTable columns={columns} data={shown} onRowClick={(l) => open(l.id)} activeId={openId} getRowId={(l) => l.id} pageSize={15} empty={t('sync.none')}
        exportCsv={{ fileName: 'sync-logs.csv', columns: [{ header: t('sync.col.time'), value: (l) => l.at }, { header: t('col.agent'), value: (l) => userName(l.userId) }, { header: t('sync.col.version'), value: (l) => l.appVersion }, { header: t('sync.col.type'), value: (l) => typeLabel(t, l.type) }, { header: t('sync.col.sent'), value: (l) => l.sent }, { header: t('sync.col.failed'), value: (l) => l.failed }, { header: t('col.status'), value: (l) => l.status }, { header: t('sync.col.duration'), value: (l) => l.ms }] }} />
      {current && <LogDrawer key={current.id} l={current} onClose={close} />}
    </>
  );
}

function LogDrawer({ l, onClose }: { l: SyncLog; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const can = useCan();
  const userName = useUserName();
  const device = useSystemStore((s) => s.devices.find((d) => d.id === l.deviceId));
  const allowed = can('sync.viewPayloads') && can('farmers.viewSensitive');
  const [reveal, setReveal] = useState(false);
  const show = (v: unknown) => (allowed && reveal ? v : maskPersonal(v));
  return (
    <DetailDrawer open onClose={onClose} title={`${typeLabel(t, l.type)} · ${userName(l.userId)}`} subtitle={f.dateTime(l.at)} badges={<SysStatus status={l.status} />}
      tabs={[
        {
          key: 'summary', label: t('sync.tab.summary'), content: (
            <div className="space-y-4">
              {l.error && (
                <div className="rounded-ctl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px]" role="status">
                  <p className="font-medium text-ink">{l.error}</p>
                  {l.errorCode && <p className="mt-1 text-body"><span className="font-semibold">{t('sync.whatToDo')}</span> {t(RETRY_GUIDANCE[l.errorCode])}</p>}
                </div>
              )}
              <Facts items={[
                [t('col.agent'), userName(l.userId)], [t('sync.col.device'), device ? `${device.model} · ${device.os === 'IOS' ? 'iOS' : 'Android'} ${device.osVersion}` : '—'],
                [t('sync.col.version'), l.appVersion], [t('sync.col.type'), typeLabel(t, l.type)],
                [t('sync.col.sent'), f.number(l.sent)], [t('sync.col.created'), f.number(l.created)], [t('sync.col.updated'), f.number(l.updated)], [t('sync.col.failed'), f.number(l.failed)],
                [t('sync.col.duration'), `${(l.ms / 1000).toFixed(1)} s`], [t('sync.errorCode'), l.errorCode ? t(`sync.code.${l.errorCode}`) : '—'],
              ]} />
            </div>
          ),
        },
        {
          key: 'payload', label: t('sync.tab.payload'), content: l.payloadPurged ? <p className="text-[14px] text-muted">{t('sync.payloadPurged')}</p> : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted">{allowed ? (reveal ? t('sync.showingPersonal') : t('sync.maskedCan')) : t('sync.maskedCannot')}</p>
                {allowed && <Button size="sm" variant="secondary" onClick={() => setReveal((v) => !v)}>{reveal ? <EyeOff /> : <Eye />} {reveal ? t('sync.hidePersonal') : t('sync.showPersonal')}</Button>}
              </div>
              <h4 className="text-[13px] font-semibold text-ink">{t('sync.request')}</h4>
              <JsonBlock value={show(l.request)} label={t('sync.request')} />
              <h4 className="text-[13px] font-semibold text-ink">{t('sync.response')}</h4>
              <JsonBlock value={show(l.response)} label={t('sync.response')} />
            </div>
          ),
        },
      ]} />
  );
}

function Devices() {
  const { t } = useT();
  const f = useFormat();
  const userName = useUserName();
  const { orgId } = useActor();
  const rows = useOrgRows(useSystemStore((s) => s.devices));
  const [openId, open, close] = useDrawerParam('device');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((d) => (!status || d.status === status) && (!query || `${userName(d.userId)} ${d.model} ${d.appVersion}`.toLowerCase().includes(query))).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  const columns = useMemo<ColumnDef<Device, unknown>[]>(() => [
    { id: 'user', header: t('sync.col.user'), accessorFn: (d) => userName(d.userId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'model', header: t('sync.col.model'), accessorKey: 'model' },
    { id: 'os', header: t('sync.col.os'), accessorFn: (d) => `${d.os === 'IOS' ? 'iOS' : 'Android'} ${d.osVersion}` },
    { id: 'version', header: t('sync.col.version'), accessorKey: 'appVersion', cell: (c) => { const d = c.row.original; return <span className="inline-flex items-center gap-1.5"><span className="font-mono text-[12px]">{d.appVersion}</span>{belowMinimum(orgId, d.appVersion) && d.status === 'ACTIVE' && <Badge tone="warning">{t('sync.belowMin')}</Badge>}{d.updateRequired && <Badge tone="danger">{t('sync.updateRequired')}</Badge>}</span>; } },
    { id: 'push', header: t('sync.col.push'), accessorKey: 'push', cell: (c) => <Badge tone={c.getValue() === 'ACTIVE' ? 'success' : c.getValue() === 'EXPIRED' ? 'warning' : 'neutral'}>{t(`sync.push.${c.getValue() as string}`)}</Badge> },
    { id: 'seen', header: t('sync.col.lastSeen'), accessorKey: 'lastSeenAt', cell: (c) => f.relative(c.getValue() as string) },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <SysStatus status={c.getValue() as string} /> },
  ], [t, f, userName, orgId]);
  const current = rows.find((d) => d.id === openId);
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('sync.searchDevices')}
        views={[{ key: 'ACTIVE', label: t('sys.status.ACTIVE'), active: status === 'ACTIVE', onSelect: () => setStatus('ACTIVE'), count: rows.filter((d) => d.status === 'ACTIVE').length }, { key: 'SIGNED_OUT', label: t('sys.status.SIGNED_OUT'), active: status === 'SIGNED_OUT', onSelect: () => setStatus('SIGNED_OUT'), count: rows.filter((d) => d.status === 'SIGNED_OUT').length }, { key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }]}
        onClear={() => { setQ(''); setStatus('ACTIVE'); }} />
      <DataTable columns={columns} data={shown} onRowClick={(d) => open(d.id)} activeId={openId} getRowId={(d) => d.id} pageSize={15} empty={t('sync.noDevices')} />
      {current && <DeviceDrawer key={current.id} d={current} onClose={close} />}
    </>
  );
}

export function DeviceActions({ d }: { d: Device }) {
  const { t } = useT();
  const { userId } = useActor();
  if (d.status !== 'ACTIVE') return null;
  return (
    <PermissionGate permission="sync.manageDevices">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => { requireUpdate(d.id, userId ?? 'system', !d.updateRequired); toast.success(t(d.updateRequired ? 'sync.toast.updateCleared' : 'sync.toast.updateRequired')); }}>{t(d.updateRequired ? 'sync.clearUpdate' : 'sync.requireUpdate')}</Button>
        <Button size="sm" variant="danger" onClick={() => { signOutDevice(d.id, userId ?? 'system'); toast.success(t('sync.toast.signedOut')); }}><LogOut /> {t('sync.signOutDevice')}</Button>
      </div>
    </PermissionGate>
  );
}

function DeviceDrawer({ d, onClose }: { d: Device; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const userName = useUserName();
  const logs = useSystemStore((s) => s.syncLogs).filter((l) => l.deviceId === d.id).slice(0, 8);
  const others = devicesOf(d.userId).filter((x) => x.id !== d.id);
  return (
    <DetailDrawer open onClose={onClose} title={d.model} subtitle={userName(d.userId)} badges={<SysStatus status={d.status} />} actions={<DeviceActions d={d} />}
      tabs={[
        {
          key: 'details', label: t('field.tab.details'), content: (
            <div className="space-y-4">
              {d.updateRequired && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-3 py-2 text-[13px] text-ink" role="status">{t('sync.updateRequiredHint')}</p>}
              <Facts items={[
                [t('sync.col.os'), `${d.os === 'IOS' ? 'iOS' : 'Android'} ${d.osVersion}`], [t('sync.col.version'), d.appVersion], [t('sync.col.push'), t(`sync.push.${d.push}`)],
                [t('sync.col.lastSeen'), f.dateTime(d.lastSeenAt)], ...(d.signedOutAt ? [[t('sync.signedOutAt'), f.dateTime(d.signedOutAt)] as [string, string]] : []),
              ]} />
              <h4 className="text-[13px] font-semibold text-ink">{t('sync.recentSyncs')}</h4>
              {logs.length ? <ul className="divide-y divide-line rounded-ctl border border-line">{logs.map((l) => <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-[13px]"><span className="flex-1 text-ink">{typeLabel(t, l.type)}</span><span className="text-muted">{f.relative(l.at)}</span><SysStatus status={l.status} /></li>)}</ul> : <p className="text-[13px] text-muted">{t('sync.noSyncs')}</p>}
              {others.length > 0 && <>
                <h4 className="text-[13px] font-semibold text-ink">{t('sync.otherDevices')}</h4>
                <ul className="space-y-1 text-[13px]">{others.map((o) => <li key={o.id} className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-muted" aria-hidden="true" /><span className="flex-1">{`${o.model} · ${o.appVersion}`}</span><SysStatus status={o.status} /></li>)}</ul>
              </>}
            </div>
          ),
        },
      ]} />
  );
}

function Versions() {
  const { t } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const settings = useOrgSettings();
  useSystemStore((s) => s.devices);
  const logs = useSystemStore((s) => s.syncLogs);
  const counts = versionCounts(orgId);
  const [min, setMin] = useState(settings.mobile.minAppVersion);
  const ret = useMemo(() => retentionSummary(orgId), [orgId, logs, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const below = counts.filter((c) => c.below).reduce((s, c) => s + c.count, 0);
  const total = counts.reduce((s, c) => s + c.count, 0);
  const [purging, setPurging] = useState(false);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold text-ink">{t('sync.versionsTitle')}</h2>
        <p className="mb-4 text-[13px] text-muted">{t('sync.versionsHint', { below, total })}</p>
        <ChartFrame table={{ head: [t('sync.col.version'), t('sync.devices')], rows: counts.map((c) => [`${c.version}${c.below ? ` (${t('sync.belowMin')})` : ''}`, f.number(c.count)]) }}>
          <HBars data={counts.map((c) => ({ label: c.below ? `${c.version} ⚠` : c.version, value: c.count }))} format={(v) => f.number(v)} />
        </ChartFrame>
        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <label className="text-[13px] font-medium text-label">{t('sync.minVersion')}<Input className="mt-1 w-32 font-mono" value={min} onChange={(e) => setMin(e.target.value)} aria-label={t('sync.minVersion')} /></label>
          <PermissionGate permission="settings.edit">
            <Button disabled={!/^\d+\.\d+(\.\d+)?$/.test(min) || min === settings.mobile.minAppVersion} onClick={() => { saveSettings(orgId, 'mobile', { mobile: { ...settings.mobile, minAppVersion: min } }); toast.success(t('sync.minSaved', { version: min })); }}>{t('common.save')}</Button>
          </PermissionGate>
          <p className="w-full text-[12px] text-muted">{t('sync.minHint')}</p>
        </div>
      </section>
      <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold text-ink">{t('sync.retentionTitle')}</h2>
        <p className="mb-4 text-[13px] text-muted">{t('sync.retentionHint')}</p>
        <Facts items={[
          [t('sync.keepLogs'), ret.days.syncLogs ? t('set.privacy.days', { count: ret.days.syncLogs }) : t('set.privacy.forever')],
          [t('sync.keepPayloads'), ret.days.payloads ? t('set.privacy.days', { count: ret.days.payloads }) : t('set.privacy.forever')],
          [t('sync.logsKept'), f.number(ret.total)], [t('sync.oldest'), ret.oldest ? f.date(ret.oldest) : '—'],
          [t('sync.duePurge'), t('sync.dueCount', { logs: ret.due, payloads: ret.payloadsDue })], [t('sync.nextPurge'), f.dateTime(ret.nextPurge)],
        ]} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" asChild><Link to="/app/settings/privacy">{t('sync.changeRetention')}</Link></Button>
          <PermissionGate permission="jobs.run">
            <Button variant="secondary" disabled={purging} onClick={async () => { setPurging(true); const r = await runNow('retention', { orgId, by: userId ?? 'system' }); setPurging(false); toast.success(r.log.join(' · ')); }}><Trash2 /> {t('sync.purgeNow')}</Button>
          </PermissionGate>
        </div>
      </section>
    </div>
  );
}

function Types() {
  const { t } = useT();
  const f = useFormat();
  const rows = useOrgRows(useSystemStore((s) => s.syncLogs));
  const by = useMemo(() => {
    const m = new Map<string, { n: number; failed: number; last?: string }>();
    for (const l of rows) { const x = m.get(l.type) ?? { n: 0, failed: 0 }; x.n++; if (l.status !== 'SUCCESS') x.failed++; if (!x.last || l.at > x.last) x.last = l.at; m.set(l.type, x); }
    return m;
  }, [rows]);
  return (
    <>
      <p className="mb-4 text-[14px] text-muted">{t('sync.typesHint', { count: SYNC_TYPES.length })}</p>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {SYNC_TYPES.map((k, i) => {
          const x = by.get(k);
          return (
            <li key={k} className="flex items-center gap-3 rounded-ctl border border-line bg-surface px-3 py-2">
              <span className="w-6 text-right text-[12px] text-muted tnum">{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] text-ink">{typeLabel(t, k)}</span><span className="block text-[12px] text-muted">{x ? t('sync.typeStats', { count: x.n, failed: x.failed, when: f.relative(x.last!) }) : t('sync.typeUnused')}</span></span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
