import { toast } from 'sonner';
import i18n from '@/i18n';

/** Every control responds (PRD rule): unfinished ones show this toast. */
export function comingSoon(detail?: string) {
  toast(i18n.t('common.comingSoon'), { description: detail ?? i18n.t('common.comingSoonHint') });
}
