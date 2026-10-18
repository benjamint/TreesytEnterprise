import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useActor, useCan, useFormat, useT } from '@/stores/hooks';
import { useNotificationStore } from '@/stores/notificationStore';
import type { AppNotification } from '@/types';

export function useNotificationText() {
  const { t } = useT();
  return (n: AppNotification) => {
    const params: Record<string, unknown> = { ...n.params };
    if (typeof params.docType === 'string') params.docType = t(`docType.${params.docType}`);
    return t(`notification.${n.key}`, params);
  };
}

export function NotificationsBell() {
  const { userId, orgId } = useActor();
  const all = useNotificationStore((s) => s.notifications);
  const { markRead, markAllRead } = useNotificationStore();
  const mine = useMemo(() => all.filter((n) => n.userId === userId && n.orgId === orgId).sort((a, b) => b.at.localeCompare(a.at)), [all, userId, orgId]);
  const unread = mine.filter((n) => !n.read).length;
  const navigate = useNavigate();
  const text = useNotificationText();
  const f = useFormat();
  const can = useCan();
  const { t } = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t('shell.notifications')}${unread ? ` (${unread})` : ''}`}>
          <Bell />
          {unread > 0 && (
            <span className="tnum absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <DropdownMenuLabel className="p-0">{t('shell.notifications')}</DropdownMenuLabel>
          {unread > 0 && (
            <button type="button" className="text-[13px] font-medium text-brand hover:underline" onClick={() => markAllRead(userId!, orgId)}>
              {t('shell.markAllRead')}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {mine.length === 0 && <div className="px-3 py-6 text-center text-[14px] text-muted">{t('shell.noNotifications')}</div>}
        {mine.slice(0, 6).map((n) => (
          <DropdownMenuItem
            key={n.id}
            className="items-start py-2.5"
            onSelect={() => {
              markRead(n.id);
              if (n.link) navigate(n.link);
            }}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] leading-snug text-ink">{text(n)}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{f.relative(n.at)}</span>
            </span>
          </DropdownMenuItem>
        ))}
        {can('notifications.view') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center font-medium text-brand" onSelect={() => navigate('/app/notifications')}>
              {t('common.viewAll')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
