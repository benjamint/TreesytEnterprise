import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { FeedbackKind } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/stores/hooks';
import { useCurrentRoute } from '@/web/layout/HelpMenu';
import { FEEDBACK_EVENT, FeedbackForm } from './FeedbackForm';

/** One feedback dialog for the web app, opened with `openFeedback()`; it records the page it was opened from. */
export function FeedbackHost() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const route = useCurrentRoute();
  const [open, setOpen] = useState<{ kind?: FeedbackKind; area?: string; path: string; page: string } | null>(null);
  useEffect(() => {
    const show = (e: Event) => setOpen({ kind: (e as CustomEvent<{ kind?: FeedbackKind }>).detail?.kind, area: route?.key, path: pathname, page: route ? t(`nav.${route.key}`) : pathname });
    window.addEventListener(FEEDBACK_EVENT, show);
    return () => window.removeEventListener(FEEDBACK_EVENT, show);
  }, [route, pathname, t]);
  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
      <DialogContent closeLabel={t('common.close')} className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('fb.title')}</DialogTitle>
          <DialogDescription>{t('fb.hint')}</DialogDescription>
        </DialogHeader>
        {open && (
          <FeedbackForm device="web" initialKind={open.kind} area={open.area} path={open.path} pageLabel={open.page} onCancel={() => setOpen(null)}
            onDone={(f) => { setOpen(null); toast.success(t('fb.sent', { number: f.number }), { action: { label: t('fb.view'), onClick: () => navigate(`/app/feedback?open=${f.id}`) } }); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
