import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Bug, ChevronDown, Lightbulb, MessageSquarePlus, Send, Sparkles, ThumbsUp } from 'lucide-react';
import type { Feedback, FeedbackKind, FeedbackStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Avatar } from '@/components/shared/Avatar';
import { DetailDrawer, Facts, FilterBar, TabEmpty, useDrawerParam } from '@/components/shared/ListKit';
import { cn } from '@/lib/utils';
import { FEEDBACK_STATUSES, OPEN_STATUSES, replyFeedback, setFeedbackStatus, toggleVote } from '@/services/feedbackService';
import { useAccessStore } from '@/stores/accessStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useActor, useCurrentUser, useFormat, useT } from '@/stores/hooks';
import { ActivityFeed } from '@/web/features/people/shared';
import { openFeedback } from './FeedbackForm';

const TONE: Record<FeedbackStatus, 'neutral' | 'info' | 'teal' | 'warning' | 'success' | 'dangerOutline'> = { NEW: 'neutral', UNDER_REVIEW: 'info', PLANNED: 'teal', IN_PROGRESS: 'warning', DONE: 'success', DECLINED: 'neutral' };
const KIND: Record<FeedbackKind, { icon: typeof Bug; tile: string }> = {
  BUG: { icon: Bug, tile: 'bg-danger/10 text-danger' },
  FEATURE: { icon: Sparkles, tile: 'bg-brand-soft text-brand' },
  IMPROVEMENT: { icon: Lightbulb, tile: 'bg-warning/10 text-warning' },
};
const NEXT: Partial<Record<FeedbackStatus, FeedbackStatus>> = { NEW: 'UNDER_REVIEW', UNDER_REVIEW: 'PLANNED', PLANNED: 'IN_PROGRESS', IN_PROGRESS: 'DONE' };

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const { t } = useT();
  return <Badge tone={TONE[status]}>{t(`fb.status.${status}`)}</Badge>;
}

function KindTile({ kind, size = 'sm' }: { kind: FeedbackKind; size?: 'sm' | 'md' }) {
  const { icon: Icon, tile } = KIND[kind];
  return <span className={cn('flex shrink-0 items-center justify-center rounded-chip', tile, size === 'md' ? 'h-8 w-8' : 'h-7 w-7')} aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>;
}

function VoteButton({ f, userId }: { f: Feedback; userId: string }) {
  const { t } = useT();
  const mine = f.votes.includes(userId);
  const own = f.userId === userId;
  return (
    <button type="button" disabled={own} aria-pressed={mine} onClick={(e) => { e.stopPropagation(); toggleVote(f.id, userId); }}
      aria-label={`${t('fb.vote')} · ${t('fb.votesN', { count: f.votes.length })}`}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors', mine ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-surface text-body hover:bg-subtle', own && 'cursor-default')}>
      <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> <span className="tnum">{f.votes.length}</span>
    </button>
  );
}

/** Feedback board: everyone sees their company's reports; platform owners see every company's and triage them. */
export function FeedbackPage() {
  const { t } = useT();
  const f = useFormat();
  const { orgId, userId } = useActor();
  const me = useCurrentUser();
  const owner = !!me?.isPlatformOwner;
  const all = useFeedbackStore((s) => s.items);
  const orgs = usePlatformStore((s) => s.orgs);
  const users = useAccessStore((s) => s.users);
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const [openId, open, close] = useDrawerParam();
  const [view, setView] = useState<'all' | 'mine' | 'bugs' | 'ideas'>('all');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const scoped = useMemo(() => all.filter((x) => owner || x.orgId === orgId), [all, owner, orgId]);
  const query = q.trim().toLowerCase();
  const inView = (x: Feedback, v: typeof view) => v === 'all' || (v === 'mine' && x.userId === userId) || (v === 'bugs' && x.kind === 'BUG') || (v === 'ideas' && x.kind !== 'BUG');
  const rows = scoped
    .filter((x) => inView(x, view) && (!status || x.status === status) && (!company || x.orgId === company) && (!query || `${x.number} ${x.title} ${x.body}`.toLowerCase().includes(query)))
    .sort((a, b) => Number(OPEN_STATUSES.has(b.status)) - Number(OPEN_STATUSES.has(a.status)) || b.votes.length - a.votes.length || b.updatedAt.localeCompare(a.updatedAt));
  const columns = useMemo<ColumnDef<Feedback, unknown>[]>(() => [
    { id: 'title', header: t('fb.col.title'), accessorFn: (x) => x.title, cell: (c) => {
      const x = c.row.original;
      return <span className="flex min-w-0 items-center gap-3"><KindTile kind={x.kind} /><span className="min-w-0"><span className="block max-w-[420px] truncate font-medium text-ink">{x.title}</span><span className="block text-[12px] text-muted"><span className="font-mono">{x.number}</span> · {t(`fb.kindShort.${x.kind}`)}{x.area ? ` · ${t(`nav.${x.area}`, { defaultValue: x.area })}` : ''}</span></span></span>;
    } },
    ...(owner ? [{ id: 'company', header: t('fb.col.company'), accessorFn: (x: Feedback) => orgName(x.orgId) }] : []),
    { id: 'votes', header: t('fb.col.votes'), accessorFn: (x) => x.votes.length, cell: (c) => <VoteButton f={c.row.original} userId={userId ?? ''} /> },
    { id: 'status', header: t('fb.col.status'), accessorKey: 'status', cell: (c) => <FeedbackStatusBadge status={c.getValue() as FeedbackStatus} /> },
    { id: 'by', header: t('fb.col.by'), accessorFn: (x) => name(x.userId) },
    { id: 'updated', header: t('fb.col.updated'), accessorKey: 'updatedAt', cell: (c) => <span className="text-muted">{f.relative(c.getValue() as string)}</span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, f, owner, userId, users, orgs]);
  const count = (pred: (x: Feedback) => boolean) => scoped.filter(pred).length;
  const current = scoped.find((x) => x.id === openId);
  return (
    <>
      <PageHeader title={t('nav.feedback')} description={owner ? t('fb.pageDescOwner') : t('fb.pageDesc')}
        primary={<Button onClick={() => openFeedback()}><MessageSquarePlus /> {t('fb.title')}</Button>} />
      <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line shadow-soft sm:grid-cols-3" data-tour="stat">
        {([['open', (x: Feedback) => OPEN_STATUSES.has(x.status)], ['active', (x: Feedback) => x.status === 'PLANNED' || x.status === 'IN_PROGRESS'], ['done', (x: Feedback) => x.status === 'DONE']] as const).map(([k, pred]) => (
          <div key={k} className="bg-surface p-5"><div className="text-[13px] font-medium text-muted">{t(`fb.stats.${k}`)}</div><div className="tnum mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{f.number(count(pred))}</div></div>
        ))}
      </div>
      <FilterBar search={q} onSearch={setQ} placeholder={t('fb.search')}
        views={(['all', 'mine', 'bugs', 'ideas'] as const).map((v) => ({ key: v, label: t(`fb.views.${v}`), active: view === v, onSelect: () => setView(v), count: scoped.filter((x) => inView(x, v)).length }))}
        filters={[
          { key: 'status', label: t('fb.filterStatus'), value: status, onChange: setStatus, options: FEEDBACK_STATUSES.map((s) => ({ value: s, label: t(`fb.status.${s}`) })) },
          ...(owner ? [{ key: 'company', label: t('fb.filterCompany'), value: company, onChange: setCompany, options: [...new Set(all.map((x) => x.orgId))].map((id) => ({ value: id, label: orgName(id) })) }] : []),
        ]}
        onClear={() => { setQ(''); setStatus(''); setCompany(''); setView('all'); }} />
      <DataTable columns={columns} data={rows} onRowClick={(x) => open(x.id)} activeId={openId} getRowId={(x) => x.id} empty={t('fb.empty')} />
      {current && <FeedbackDrawer key={current.id} item={current} owner={owner} onClose={close} />}
    </>
  );
}

function FeedbackDrawer({ item: x, owner, onClose }: { item: Feedback; owner: boolean; onClose: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const { userId } = useActor();
  const users = useAccessStore((s) => s.users);
  const orgs = usePlatformStore((s) => s.orgs);
  const [reply, setReply] = useState('');
  const person = (id: string) => users.find((u) => u.id === id);
  const reporter = person(x.userId);
  const next = NEXT[x.status];
  const move = (s: FeedbackStatus) => { setFeedbackStatus(x.id, s, userId ?? ''); toast.success(t('fb.statusChanged', { number: x.number, status: t(`fb.status.${s}`) })); };
  const send = () => { if (!reply.trim()) return; replyFeedback(x.id, userId ?? '', reply); setReply(''); };
  return (
    <DetailDrawer open onClose={onClose} title={x.title} subtitle={`${x.number} · ${orgs.find((o) => o.id === x.orgId)?.name ?? ''} · ${f.dateTime(x.createdAt)}`}
      badges={<><Badge tone="neutral">{t(`fb.kindShort.${x.kind}`)}</Badge><FeedbackStatusBadge status={x.status} />{x.severity && <Badge tone={x.severity === 'HIGH' || x.severity === 'BLOCKING' ? 'danger' : 'warning'}>{t(`fb.severityLevel.${x.severity}`)}</Badge>}<span className="tnum text-[12px] text-muted">{t('fb.votesN', { count: x.votes.length })}</span></>}
      actions={<>
        {x.userId !== userId && <Button variant="secondary" onClick={() => { const had = x.votes.includes(userId ?? ''); toggleVote(x.id, userId ?? ''); if (!had) toast.success(t('fb.voteAdded', { number: x.number })); }} aria-pressed={x.votes.includes(userId ?? '')}><ThumbsUp /> {x.votes.includes(userId ?? '') ? t('fb.voted') : t('fb.vote')}</Button>}
        {owner && x.status !== 'DECLINED' && x.status !== 'DONE' && <Button variant="ghost" onClick={() => move('DECLINED')}>{t('fb.decline')}</Button>}
        {owner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary">{t('fb.setStatus')} <ChevronDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuRadioGroup value={x.status} onValueChange={(v) => move(v as FeedbackStatus)}>
                {FEEDBACK_STATUSES.map((s) => <DropdownMenuRadioItem key={s} value={s}>{t(`fb.status.${s}`)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {owner && next && <Button onClick={() => move(next)}>{t(`fb.next.${x.status}`)}</Button>}
      </>}
      tabs={[
        { key: 'details', label: t('fb.tab.details'), content: (
          <div className="space-y-6">
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-body">{x.body}</p>
            {x.screenshot && <a href={x.screenshot} target="_blank" rel="noreferrer" className="block"><img src={x.screenshot} alt={t('fb.screenshotAlt', { number: x.number })} className="max-h-72 w-full rounded-ctl border border-line object-contain bg-subtle" /></a>}
            <Facts items={[
              [t('fb.reporter'), reporter?.name ?? x.userId],
              [t('fb.page'), x.path ? (x.path.startsWith('/app') ? <Link key="p" to={x.path} className="text-link">{x.area ? t(`nav.${x.area}`, { defaultValue: x.path }) : x.path}</Link> : x.path) : '—'],
              [t('fb.deviceCol'), `${t(`fb.device.${x.context.device}`)}${x.context.viewport ? ` · ${x.context.viewport}` : ''}`],
              [t('fb.language'), x.context.language.toUpperCase()],
              [t('fb.appVersion'), x.context.appVersion],
              [t('fb.created'), f.dateTime(x.createdAt)],
            ]} />
          </div>
        ) },
        { key: 'conversation', label: t('fb.tab.conversation'), count: x.replies.length, content: (
          <div className="space-y-5">
            {x.replies.length ? (
              <ol className="space-y-4">
                {x.replies.map((r) => {
                  const u = person(r.userId);
                  return (
                    <li key={r.id} className="flex gap-3">
                      <Avatar name={u?.name ?? r.userId} color={u?.avatarColor ?? '#6B6861'} size={32} />
                      <div className="min-w-0 flex-1 rounded-ctl border border-line bg-surface px-4 py-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]"><span className="font-medium text-ink">{u?.name ?? r.userId}</span>{u?.isPlatformOwner && <Badge tone="brand">{t('fb.team')}</Badge>}<span className="text-muted">{f.relative(r.at)}</span></div>
                        <p className="whitespace-pre-line text-[14px] leading-relaxed text-body">{r.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : <TabEmpty>{t('fb.noReplies')}</TabEmpty>}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="rounded-ctl border border-line-strong bg-surface shadow-xs focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/15">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder={t('fb.replyPlaceholder')} aria-label={t('fb.replyPlaceholder')} className="block w-full resize-none rounded-t-ctl bg-transparent px-3 py-2.5 text-[14px] text-ink placeholder:text-muted focus:outline-none" />
              <div className="flex justify-end border-t border-line px-2 py-2"><Button type="submit" size="sm" disabled={!reply.trim()}><Send /> {t('fb.replySend')}</Button></div>
            </form>
          </div>
        ) },
        { key: 'activity', label: t('people.tab.activity'), content: <ActivityFeed entity="feedback" entityId={x.id} /> },
      ]}
    />
  );
}
