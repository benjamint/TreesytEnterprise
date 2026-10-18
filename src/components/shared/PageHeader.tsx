import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { useT } from '@/stores/hooks';

/** List/detail page header: title, one-line description, one primary action, "?" tour (PRD 6.2). */
export function PageHeader({
  eyebrow,
  title,
  description,
  primary,
  actions,
  onTour,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  primary?: ReactNode;
  actions?: ReactNode;
  onTour?: () => void;
}) {
  const { t } = useT();
  return (
    <header className="flex flex-col gap-5 pb-8 md:flex-row md:items-end md:justify-between" data-tour="page-header">
      <div className="min-w-0 space-y-2">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="flex items-center gap-3">
          <h1 className="text-[32px] leading-[1.15] lg:text-[36px]" data-tour="page-title">{title}</h1>
          {onTour && (
            <Tip label={t('common.tour')}>
              <button type="button" onClick={onTour} className="rounded-full p-1 text-muted hover:bg-brand-soft hover:text-brand" aria-label={t('common.tour')} data-tour="page-tour">
                <CircleHelp className="h-5 w-5" />
              </button>
            </Tip>
          )}
        </div>
        {description && <p className="max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {(primary || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-3" data-tour="page-primary">
          {actions}
          {primary}
        </div>
      )}
    </header>
  );
}

export { Button };
