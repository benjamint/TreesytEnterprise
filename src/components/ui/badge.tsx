import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex h-[22px] items-center gap-1 rounded-chip px-2 text-[12px] font-medium whitespace-nowrap [&_svg]:size-3', {
  variants: {
    tone: {
      neutral: 'bg-canvas text-label ring-1 ring-inset ring-line',
      brand: 'bg-brand-soft text-brand ring-1 ring-inset ring-brand/10',
      info: 'bg-info/10 text-info ring-1 ring-inset ring-info/15',
      success: 'bg-success/10 text-success ring-1 ring-inset ring-success/15',
      paid: 'bg-success text-white dark:text-canvas',
      done: 'bg-ink/90 text-surface dark:bg-success/30 dark:text-ink',
      teal: 'bg-teal/10 text-teal ring-1 ring-inset ring-teal/15',
      warning: 'bg-warning/10 text-warning ring-1 ring-inset ring-warning/15',
      warningOutline: 'ring-1 ring-inset ring-warning/50 text-warning',
      danger: 'bg-danger/10 text-danger ring-1 ring-inset ring-danger/15',
      dangerOutline: 'ring-1 ring-inset ring-danger/50 text-danger',
      unknown: 'bg-unknown/10 text-unknown ring-1 ring-inset ring-unknown/15',
      dark: 'bg-badge-dark text-white',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
