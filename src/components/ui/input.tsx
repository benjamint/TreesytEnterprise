import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }>(
  ({ className, compact, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex w-full rounded-ctl border border-line-strong bg-surface px-3 text-[14px] text-ink shadow-xs placeholder:text-muted transition-[border-color,box-shadow] duration-150 [.mobile-ui_&]:px-4 [.mobile-ui_&]:text-[16px]',
        'hover:border-muted/50 focus-visible:outline-none focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 disabled:opacity-60',
        compact ? 'h-ctl' : 'h-ctl-lg',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
