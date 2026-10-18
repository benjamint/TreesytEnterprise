import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-canvas text-label border border-line',
      brand: 'bg-brand-soft text-brand',
      info: 'bg-info/10 text-info',
      success: 'bg-success/10 text-success',
      paid: 'bg-success text-white',
      done: 'bg-ink/90 text-surface dark:bg-success/30 dark:text-ink',
      teal: 'bg-teal/10 text-teal',
      warning: 'bg-warning/10 text-warning',
      warningOutline: 'border border-warning/50 text-warning',
      danger: 'bg-danger/10 text-danger',
      dangerOutline: 'border border-danger/50 text-danger',
      unknown: 'bg-unknown/10 text-unknown',
      dark: 'bg-badge-dark text-white',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
