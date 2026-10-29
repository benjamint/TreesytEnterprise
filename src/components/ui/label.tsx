import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/** Field label: 13px medium ink on the web; 12px uppercase in the phone app (PRD 6.1, 9). */
export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn('mb-1.5 block text-[13px] font-medium text-ink [.mobile-ui_&]:mb-2 [.mobile-ui_&]:text-[12px] [.mobile-ui_&]:font-semibold [.mobile-ui_&]:uppercase [.mobile-ui_&]:tracking-[0.08em] [.mobile-ui_&]:text-label', className)} {...props} />,
);
Label.displayName = 'Label';
