import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('mb-8 flex gap-1 overflow-x-auto border-b border-line scrollbar-thin', className)} {...props} />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn('relative -mb-px whitespace-nowrap border-b-2 border-transparent px-4 pb-3 pt-1 text-[14px] font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-brand data-[state=active]:text-brand', className)}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = TabsPrimitive.Content;
