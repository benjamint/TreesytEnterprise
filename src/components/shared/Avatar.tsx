import { cn } from '@/lib/utils';
import { readablePair } from '@/lib/color';

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function Avatar({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  const pair = /^#[0-9a-f]{3,6}$/i.test(color) ? readablePair(color) : { bg: color, fg: '#fff' };
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-surface', className)}
      style={{ width: size, height: size, background: pair.bg, color: pair.fg, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
