import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }>(
  ({ className, compact, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex w-full rounded-ctl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-muted transition-shadow duration-150',
        'focus-visible:outline-none focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand-soft disabled:opacity-60',
        compact ? 'h-11' : 'h-14',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
