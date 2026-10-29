import type { ReactNode } from 'react';

/** Helpful empty state with a small spot illustration (PRD 6.0). */
export function EmptyState({ title, body, action, bare }: { title: ReactNode; body?: ReactNode; action?: ReactNode; bare?: boolean }) {
  return (
    <div className={bare ? 'flex flex-col items-center justify-center px-6 py-12 text-center' : 'flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center'}>
      <svg width="80" height="60" viewBox="0 0 96 72" aria-hidden="true" className="mb-4">
        <ellipse cx="48" cy="62" rx="40" ry="8" fill="rgb(var(--brand-soft))" />
        <path d="M30 60c0-14 6-24 18-30 12 6 18 16 18 30" fill="rgb(var(--brand) / 0.18)" />
        <path d="M48 60V24" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" />
        <path d="M48 36c-6-2-10-7-11-13 7 0 11 4 11 13Zm0 6c6-2 11-7 12-14-8 0-12 5-12 14Z" fill="#B8E05A" />
        <circle cx="74" cy="16" r="6" fill="#F2C94C" opacity="0.8" />
      </svg>
      <h3 className="text-[15px]">{title}</h3>
      {body && <p className="mt-1 max-w-md text-[14px] text-muted">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
