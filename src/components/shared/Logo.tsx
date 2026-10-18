import { cn } from '@/lib/utils';

/** Dark circular badge with a lime leaf mark (PRD 6.0). */
export function LogoBadge({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#0F2A20" />
      <path d="M32 13c-8.5 6.5-13 13.5-13 20.5a13 13 0 0 0 26 0C45 26.5 40.5 19.5 32 13Z" fill="#B8E05A" />
      <path d="M32 25v26M32 36l-6-5M32 42l7-6" stroke="#0F2A20" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  // Brand name, not translated.
  // eslint-disable-next-line i18next/no-literal-string
  return <span className={cn('text-[19px] font-semibold tracking-[-0.02em] text-ink', className)}>TreeSyt</span>;
}

/** A company's logo: initials on its brand colour (Settings → Branding replaces it). */
export function CompanyLogo({ text, color, size = 28, className }: { text: string; color: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
