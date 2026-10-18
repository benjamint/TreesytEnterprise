import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useT } from '@/stores/hooks';
import { OfflineBanner } from './SyncBar';

export function MobileHeader({ title, back, right }: { title: ReactNode; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useT();
  return (
    <div className="shrink-0">
      <div className="flex h-14 items-center gap-2 px-3">
        {back && (
          <button type="button" onClick={() => navigate(-1)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-canvas" aria-label={t('mobile.back')}>
            <ChevronLeft className="h-6 w-6 text-ink" />
          </button>
        )}
        <h1 className={`flex-1 truncate text-[19px] ${back ? '' : 'pl-2'}`}>{title}</h1>
        {right}
      </div>
      <OfflineBanner />
    </div>
  );
}
