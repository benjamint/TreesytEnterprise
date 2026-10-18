import { cn } from '@/lib/utils';

/** Small inline flags (no emoji, so they render the same on every OS). */
export function Flag({ code, className }: { code: string; className?: string }) {
  const cls = cn('inline-block h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10', className);
  switch (code) {
    case 'GH':
      return (
        <svg viewBox="0 0 30 20" className={cls} aria-label="GH">
          <rect width="30" height="20" fill="#006B3F" />
          <rect width="30" height="13.33" fill="#FCD116" />
          <rect width="30" height="6.67" fill="#CE1126" />
          <path d="M15 7.2l.9 2.7h2.8l-2.3 1.7.9 2.7-2.3-1.7-2.3 1.7.9-2.7-2.3-1.7h2.8z" fill="#000" />
        </svg>
      );
    case 'CI':
      return (
        <svg viewBox="0 0 30 20" className={cls} aria-label="CI">
          <rect width="10" height="20" fill="#F77F00" />
          <rect x="10" width="10" height="20" fill="#FFF" />
          <rect x="20" width="10" height="20" fill="#009E60" />
        </svg>
      );
    case 'SE':
      return (
        <svg viewBox="0 0 30 20" className={cls} aria-label="SE">
          <rect width="30" height="20" fill="#006AA7" />
          <rect x="9" width="4" height="20" fill="#FECC00" />
          <rect y="8" width="30" height="4" fill="#FECC00" />
        </svg>
      );
    default:
      return <span className={cn(cls, 'bg-line text-[8px] leading-[14px] text-center font-semibold text-label')}>{code}</span>;
  }
}
