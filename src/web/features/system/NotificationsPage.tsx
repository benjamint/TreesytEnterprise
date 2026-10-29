import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Bell, CheckCheck, CreditCard, Mail, MessageSquare, RefreshCw, RotateCw, Smartphone, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import type { AppNotification, OutboxMessage } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { DetailDrawer, Facts, FilterBar, useDrawerParam } from '@/components/shared/ListKit';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { inboxGroups, resendMessage, type InboxFilter } from '@/services/systemService';
import { useNotificationStore } from '@/stores/notificationStore';
import { useActor, useCan, useCurrentOrg, useFormat, useOrgRows, useT } from '@/stores/hooks';
import { useNotificationText } from '@/web/layout/NotificationsBell';
import { cn } from '@/lib/utils';
import { SysStatus, useUserName } from './shared';

const KIND_ICON = { APPROVAL: Stamp, PAYMENT: CreditCard, SYNC: RefreshCw, ALERT: AlertTriangle } as const;
const KIND_TONE = { APPROVAL: 'bg-brand-soft text-brand', PAYMENT: 'bg-info/10 text-info', SYNC: 'bg-canvas text-body', ALERT: 'bg-warning/10 text-warning' } as const;
const CHANNEL_ICON = { EMAIL: Mail, SMS: MessageSquare, PUSH: Smartphone } as const;

/** Notifications (PRD K2): inbox grouped by day, and the outbox of every simulated email, SMS and push. */
export function NotificationsPage() {
  const { t } = useT();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') === 'outbox' && can('notifications.viewOutbox') ? 'outbox' : 'inbox';
  useDemoNotes([{ id: 'ntf', key: 'demo.note.notifications' }]);
  return (
    <>
      <PageHeader eyebrow={t('nav.section.insights')} title={t('nav.notifications')} description={t('pages.notifications')} />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'inbox' ? {} : { view: v })}>
        <TabsList>
          <TabsTrigger value="inbox">{t('ntf.tab.inbox')}</TabsTrigger>
          {can('notifications.viewOutbox') && <TabsTrigger value="outbox">{t('ntf.tab.outbox')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="inbox" className="mt-5"><Inbox /></TabsContent>
        <TabsContent value="outbox" className="mt-5"><Outbox /></TabsContent>
      </Tabs>
    </>
  );
}

function Inbox() {
  const { t } = useT();
  const f = useFormat();
  const { userId, orgId } = useActor();
  const navigate = useNavigate();
  const all = useNotificationStore((s) => s.notifications);
  const { markRead, markAllRead } = useNotificationStore();
  const text = useNotificationText();
  const [filter, setFilter] = useState<InboxFilter>('ALL');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => inboxGroups(orgId, userId ?? '', filter), [all, orgId, userId, filter]);
  const mine = all.filter((n) => n.orgId === orgId && n.userId === userId);
  const count = (k: InboxFilter) => mine.filter((n) => (k === 'ALL' ? true : k === 'UNREAD' ? !n.read : n.kind === k)).length;
  const unread = count('UNREAD');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dayLabel = (d: string) => (d === today ? t('ntf.today') : d === yesterday ? t('ntf.yesterday') : f.date(d, 'EEEE d MMMM'));
  const openOne = (n: AppNotification) => { markRead(n.id); if (n.link) navigate(n.link); };
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('ntf.filter')}>
          {(['ALL', 'UNREAD', 'APPROVAL', 'PAYMENT', 'SYNC', 'ALERT'] as InboxFilter[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={cn('rounded-full border px-3 py-1.5 text-[13px] font-medium', filter === k ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body hover:border-brand/40')}>
              {t(`ntf.kind.${k}`)} <span className="ml-1 text-muted tnum">{count(k)}</span>
            </button>
          ))}
        </div>
        <Button className="ml-auto" size="sm" variant="secondary" disabled={!unread} onClick={() => { markAllRead(userId!, orgId); toast.success(t('ntf.allRead')); }}><CheckCheck /> {t('shell.markAllRead')}</Button>
      </div>
      {!groups.length ? <EmptyState title={t('ntf.empty')} body={t('ntf.emptyHint')} /> : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)}>
              <h2 className="eyebrow mb-2">{dayLabel(g.day)}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
                {g.items.map((n) => {
                  const Icon = KIND_ICON[n.kind];
                  return (
                    <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.read && 'bg-brand-soft/30')}>
                      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', KIND_TONE[n.kind])}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openOne(n)}>
                        <span className={cn('block text-[14px] leading-snug', n.read ? 'text-body' : 'font-medium text-ink')}>{text(n)}</span>
                        <span className="mt-0.5 block text-[12px] text-muted">{`${t(`ntf.kind.${n.kind}`)} · ${f.date(n.at, 'HH:mm')}`}</span>
                      </button>
                      {!n.read ? (
                        <button type="button" onClick={() => markRead(n.id)} className="shrink-0 rounded-full px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft">{t('ntf.markRead')}</button>
                      ) : <span className="sr-only">{t('ntf.read')}</span>}
                      {!n.read && <span role="img" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label={t('ntf.unread')} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Outbox() {
  const { t } = useT();
  const f = useFormat();
  const rows = useOrgRows(useNotificationStore((s) => s.outbox));
  const [openId, open, close] = useDrawerParam('msg');
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const query = q.trim().toLowerCase();
  const shown = rows.filter((m) => (!channel || m.channel === channel) && (!status || m.status === status) && (!query || `${m.recipient} ${m.subject ?? ''} ${m.body} ${m.templateId}`.toLowerCase().includes(query))).sort((a, b) => b.at.localeCompare(a.at));
  const columns = useMemo<ColumnDef<OutboxMessage, unknown>[]>(() => [
    { id: 'at', header: t('ntf.col.sent'), accessorKey: 'at', cell: (c) => f.dateTime(c.getValue() as string) },
    { id: 'channel', header: t('ntf.col.channel'), accessorKey: 'channel', cell: (c) => { const ch = c.getValue() as OutboxMessage['channel']; const Icon = CHANNEL_ICON[ch]; return <span className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4 text-muted" aria-hidden="true" />{t(`ntf.channel.${ch}`)}</span>; } },
    { id: 'to', header: t('ntf.col.recipient'), accessorKey: 'recipient', cell: (c) => <span className="font-mono text-[12px]">{c.getValue() as string}</span> },
    { id: 'template', header: t('ntf.col.template'), accessorKey: 'templateId', cell: (c) => t(`ntf.template.${c.getValue() as string}`, { defaultValue: c.getValue() as string }) },
    { id: 'lang', header: t('ntf.col.language'), accessorKey: 'language', cell: (c) => (c.getValue() as string).toUpperCase() },
    { id: 'preview', header: t('ntf.col.preview'), accessorFn: (m) => m.subject ?? m.body, cell: (c) => <span className="line-clamp-1 max-w-xs text-[13px] text-muted">{c.getValue() as string}</span> },
    { id: 'status', header: t('col.status'), accessorKey: 'status', cell: (c) => <SysStatus status={c.getValue() as string} /> },
  ], [t, f]);
  const current = rows.find((m) => m.id === openId);
  const count = (s: string) => rows.filter((m) => m.status === s).length;
  return (
    <>
      <FilterBar search={q} onSearch={setQ} placeholder={t('ntf.searchOutbox')}
        views={[{ key: '', label: t('field.view.all'), active: !status, onSelect: () => setStatus(''), count: rows.length }, ...(['SENT', 'DELIVERED', 'FAILED'] as const).map((s) => ({ key: s, label: t(`sys.status.${s}`), active: status === s, onSelect: () => setStatus(s), count: count(s) }))]}
        filters={[{ key: 'channel', label: t('ntf.col.channel'), value: channel, onChange: setChannel, options: (['EMAIL', 'SMS', 'PUSH'] as const).map((c) => ({ value: c, label: t(`ntf.channel.${c}`) })) }]}
        onClear={() => { setQ(''); setChannel(''); setStatus(''); }} />
      <DataTable columns={columns} data={shown} onRowClick={(m) => open(m.id)} activeId={openId} getRowId={(m) => m.id} empty={t('ntf.outboxEmpty')} pageSize={15}
        exportCsv={{ fileName: 'outbox.csv', columns: [{ header: t('ntf.col.sent'), value: (m) => m.at }, { header: t('ntf.col.channel'), value: (m) => m.channel }, { header: t('ntf.col.recipient'), value: (m) => m.recipient }, { header: t('ntf.col.template'), value: (m) => m.templateId }, { header: t('col.status'), value: (m) => m.status }] }} />
      {current && <MessageDrawer key={current.id} m={current} onClose={close} />}
    </>
  );
}

function MessageDrawer({ m, onClose }: { m: OutboxMessage; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const userName = useUserName();
  return (
    <DetailDrawer open onClose={onClose} title={m.subject ?? t(`ntf.channel.${m.channel}`)} subtitle={`${m.recipient} · ${f.dateTime(m.at)}`} badges={<SysStatus status={m.status} />}
      actions={m.status === 'FAILED' ? <PermissionGate permission="notifications.viewOutbox"><Button size="sm" onClick={() => { resendMessage(m.id); toast.success(t('ntf.resent')); onClose(); }}><RotateCw /> {t('ntf.resend')}</Button></PermissionGate> : undefined}
      tabs={[
        {
          key: 'preview', label: t('ntf.preview'), content: (
            <div className="space-y-4">
              {m.status === 'FAILED' && <p className="rounded-ctl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-ink" role="status">{t('ntf.failedBecause', { reason: m.failureReason ?? '—' })}</p>}
              {m.channel === 'EMAIL' ? <EmailPreview m={m} /> : m.channel === 'SMS' ? <SmsPreview m={m} /> : <PushPreview m={m} />}
            </div>
          ),
        },
        {
          key: 'details', label: t('field.tab.details'), content: (
            <Facts items={[
              [t('ntf.col.channel'), t(`ntf.channel.${m.channel}`)], [t('ntf.col.recipient'), m.userId ? `${userName(m.userId)} · ${m.recipient}` : m.recipient],
              [t('ntf.col.template'), t(`ntf.template.${m.templateId}`, { defaultValue: m.templateId })], [t('ntf.col.language'), m.language.toUpperCase()],
              [t('col.status'), t(`sys.status.${m.status}`)], [t('ntf.col.sent'), f.dateTime(m.at)], [t('ntf.simulated'), t('ntf.simulatedHint')],
            ]} />
          ),
        },
      ]} />
  );
}

function EmailPreview({ m }: { m: OutboxMessage }) {
  const org = useCurrentOrg();
  const { t } = useT();
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white text-[#1d2b24] shadow-soft" aria-label={t('ntf.emailPreview')}>
      <div className="flex items-center gap-3 px-5 py-3 text-white" style={{ background: org.branding.primaryColor }}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[13px] font-bold">{org.branding.logoText.slice(0, 2)}</span>
        <span className="font-semibold">{org.branding.senderName}</span>
      </div>
      <div className="space-y-1 border-b border-[#e3e8e5] px-5 py-3 text-[12px] text-[#5d6b64]">
        <div>{`${t('ntf.to')}: ${m.recipient}`}</div>
        <div className="text-[15px] font-semibold text-[#1d2b24]">{m.subject}</div>
      </div>
      <div className="whitespace-pre-line px-5 py-4 text-[14px] leading-relaxed">{m.body}</div>
      <div className="border-t border-[#e3e8e5] px-5 py-3 text-[11px] text-[#5d6b64]">{org.branding.emailFooter ?? `${org.legalName} · ${t('ntf.sentBy')}`}</div>
    </div>
  );
}

function SmsPreview({ m }: { m: OutboxMessage }) {
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[28px] border border-line bg-canvas p-4" aria-label={t('ntf.smsPreview')}>
      <div className="mb-3 text-center text-[12px] font-semibold text-ink">{org.branding.senderName}</div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[14px] leading-snug text-ink shadow-soft">{m.body}</div>
      <div className="mt-1 text-[11px] text-muted">{f.date(m.at, 'HH:mm')} · {t('ntf.chars', { count: m.body.length, parts: Math.ceil(m.body.length / 160) })}</div>
    </div>
  );
}

function PushPreview({ m }: { m: OutboxMessage }) {
  const org = useCurrentOrg();
  const { t } = useT();
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[28px] bg-[linear-gradient(160deg,#16382b,#0f2a20)] p-4" aria-label={t('ntf.pushPreview')}>
      <div className="mb-6 text-center text-[32px] font-light text-white/90 tnum">09:41</div>
      <div className="flex items-start gap-3 rounded-2xl bg-white/90 p-3 backdrop-blur">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-on-brand"><Bell className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 text-[#1d2b24]">
          <div className="flex justify-between text-[12px]"><span className="font-semibold">{m.subject ?? org.name}</span><span className="text-[#5d6b64]">{t('ntf.now')}</span></div>
          <div className="text-[13px] leading-snug">{m.body}</div>
        </div>
      </div>
      <Badge tone="neutral" className="mt-3">{`TreeSyt · ${org.name}`}</Badge>
    </div>
  );
}
