import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Lock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import type { AuditEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { diff, queryAudit } from '@/services/systemService';
import { download, fileName, startExport } from '@/services/reportService';
import { useActivityStore } from '@/stores/activityStore';
import { useActor, useCan, useFormat, useT } from '@/stores/hooks';
import { useUserName } from './shared';

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Audit log (PRD K4): immutable list of who changed what, with before / after, IP, device and GPS. */
export function AuditPage() {
  const { t } = useT();
  const f = useFormat();
  const can = useCan();
  const userName = useUserName();
  const { orgId, userId } = useActor();
  const audit = useActivityStore((s) => s.audit);
  const [openId, open, close] = useDrawerParam('entry');
  const [q, setQ] = useState('');
  const [actor, setActor] = useState('');
  const [entity, setEntity] = useState('');
  const [key, setKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useDemoNotes([{ id: 'audit', key: 'demo.note.audit' }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scoped = useMemo(() => queryAudit({ orgId }), [audit, orgId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => queryAudit({ orgId, actorId: actor || undefined, entity: entity || undefined, key: key || undefined, from: from || undefined, to: to || undefined, q: q || undefined }), [audit, orgId, actor, entity, key, from, to, q]);
  const action = (k: string) => t(`audit.${k}`, { defaultValue: k });
  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(() => [
    { id: 'at', header: t('platform.col.when'), accessorKey: 'at', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'actor', header: t('platform.col.actor'), accessorFn: (r) => userName(r.actorId), cell: (c) => <span className="font-medium text-ink">{c.getValue() as string}</span> },
    { id: 'entity', header: t('audit.col.entity'), accessorFn: (r) => t(`audit.entity.${r.entity}`, { defaultValue: r.entity }) },
    { id: 'action', header: t('platform.col.action'), accessorFn: (r) => action(r.key) },
    { id: 'change', header: t('platform.col.change'), enableSorting: false, accessorFn: (r) => diff(r.before, r.after).map((d) => d.path).join(', '), cell: (c) => { const d = diff(c.row.original.before, c.row.original.after); return <span className="text-[13px] text-muted">{d.length ? d.slice(0, 2).map((x) => `${x.path}: ${show(x.before)} → ${show(x.after)}`).join(' · ') + (d.length > 2 ? ` +${d.length - 2}` : '') : '—'}</span>; } },
    { id: 'ip', header: t('audit.col.ip'), accessorKey: 'ip', cell: (c) => <span className="font-mono text-[12px]">{(c.getValue() as string) ?? '—'}</span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, userName]);
  const current = scoped.find((r) => r.id === openId);
  const actors = [...new Set(scoped.map((r) => r.actorId))];
  const entities = [...new Set(scoped.map((r) => r.entity))];
  const keys = [...new Set(scoped.map((r) => r.key))];
  const doExport = (format: 'CSV' | 'XLSX') => {
    const header = [t('platform.col.when'), t('platform.col.actor'), t('audit.col.entity'), t('audit.col.entityId'), t('platform.col.action'), t('audit.before'), t('audit.after'), t('audit.col.ip'), t('audit.col.device'), t('audit.col.gps')];
    const out = rows.map((r) => [r.at, userName(r.actorId), r.entity, r.entityId, action(r.key), show(r.before), show(r.after), r.ip ?? '', r.device ?? '', r.gps ? `${r.gps.lat}, ${r.gps.lng}` : '']);
    const res = startExport({ orgId, userId: userId ?? 'system', name: t('nav.audit'), format, header, rows: out });
    if (res.file) download(res.file, fileName(t('nav.audit'), format));
    else toast.info(t('rpt.exportQueued', { count: out.length }));
  };
  return (
    <>
      <PageHeader eyebrow={t('nav.section.system')} title={t('nav.audit')} description={t('pages.audit')}
        primary={can('audit.export') ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button><Download /> {t('common.export')}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => doExport('XLSX')}>{t('rpt.excel')}</DropdownMenuItem><DropdownMenuItem onSelect={() => doExport('CSV')}>{t('rpt.csv')}</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        ) : undefined} />
      <p className="mb-4 inline-flex items-center gap-2 rounded-ctl bg-canvas px-3 py-2 text-[13px] text-body"><Lock className="h-4 w-4 text-muted" aria-hidden="true" /> {t('audit.immutable')}</p>
      <FilterBar search={q} onSearch={setQ} placeholder={t('audit.search')}
        filters={[
          { key: 'actor', label: t('platform.col.actor'), value: actor, onChange: setActor, options: actors.map((a) => ({ value: a, label: userName(a) })) },
          { key: 'entity', label: t('audit.col.entity'), value: entity, onChange: setEntity, options: entities.map((e) => ({ value: e, label: t(`audit.entity.${e}`, { defaultValue: e }) })) },
          { key: 'key', label: t('platform.col.action'), value: key, onChange: setKey, options: keys.map((k) => ({ value: k, label: action(k) })) },
        ]}
        extra={<div className="flex items-center gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('audit.from')} className="h-10 w-[150px]" /><span className="text-muted">–</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('audit.to')} className="h-10 w-[150px]" /></div>}
        onClear={() => { setQ(''); setActor(''); setEntity(''); setKey(''); setFrom(''); setTo(''); }} />
      <DataTable columns={columns} data={rows} onRowClick={(r) => open(r.id)} activeId={openId} getRowId={(r) => r.id} pageSize={15} empty={t('audit.none')} />
      {current && <AuditDrawer key={current.id} e={current} onClose={close} />}
    </>
  );
}

function AuditDrawer({ e, onClose }: { e: AuditEntry; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const userName = useUserName();
  const lines = diff(e.before, e.after);
  return (
    <DetailDrawer open onClose={onClose} title={t(`audit.${e.key}`, { defaultValue: e.key })} subtitle={`${userName(e.actorId)} · ${f.dateTime(e.at)}`}
      tabs={[
        {
          key: 'change', label: t('audit.tab.change'), content: (
            <div className="space-y-4">
              {lines.length ? (
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-line text-left text-[12px] text-label"><th className="py-2 pr-2 font-semibold">{t('audit.field')}</th><th className="py-2 pr-2 font-semibold">{t('audit.before')}</th><th className="py-2 font-semibold">{t('audit.after')}</th></tr></thead>
                  <tbody className="divide-y divide-line">{lines.map((d) => <tr key={d.path}><td className="py-2 pr-2 font-mono text-[12px] text-ink">{d.path}</td><td className="py-2 pr-2"><span className="rounded bg-danger/10 px-1.5 py-0.5 text-danger line-through decoration-danger/40">{show(d.before)}</span></td><td className="py-2"><span className="rounded bg-success/10 px-1.5 py-0.5 text-success">{show(d.after)}</span></td></tr>)}</tbody>
                </table>
              ) : <p className="text-[13px] text-muted">{t('audit.noDiff')}</p>}
              <Facts items={[
                [t('audit.col.entity'), t(`audit.entity.${e.entity}`, { defaultValue: e.entity })], [t('audit.col.entityId'), <span key="id" className="font-mono text-[12px]">{e.entityId}</span>],
                [t('audit.col.ip'), e.ip ?? '—'], [t('audit.col.device'), e.device ?? '—'],
                [t('audit.col.gps'), e.gps ? <a key="gps" className="inline-flex items-center gap-1 text-brand hover:underline" href={`https://www.openstreetmap.org/?mlat=${e.gps.lat}&mlon=${e.gps.lng}#map=15/${e.gps.lat}/${e.gps.lng}`} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" />{`${e.gps.lat}, ${e.gps.lng}`}</a> : '—'],
                [t('audit.entryId'), <span key="eid" className="font-mono text-[12px]">{e.id}</span>],
              ]} />
            </div>
          ),
        },
      ]} />
  );
}
