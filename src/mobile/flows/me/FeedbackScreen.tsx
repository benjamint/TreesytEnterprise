import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useT } from '@/stores/hooks';
import { FeedbackForm } from '@/web/features/feedback/FeedbackForm';

/** Phone: send a bug report or idea; the app version and device are attached. */
export function FeedbackScreen() {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('fb.title')} back />
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-1">
        <p className="mb-5 text-[14px] leading-snug text-muted">{t('fb.hint')}</p>
        <FeedbackForm device="mobile" area="mobile" path="/m" pageLabel={t('fb.device.mobile')}
          onDone={(f) => { toast.success(t('fb.sent', { number: f.number })); navigate('/m/me', { replace: true }); }} />
      </div>
    </div>
  );
}
