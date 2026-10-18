import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => <CommandPrimitive ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden bg-surface text-ink', className)} {...props} />,
);
Command.displayName = 'Command';

export const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(
  ({ className, ...props }, ref) => (
    <div className="flex items-center gap-3 border-b border-line px-5">
      <Search className="h-5 w-5 shrink-0 text-muted" />
      <CommandPrimitive.Input ref={ref} className={cn('flex h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-muted', className)} {...props} />
    </div>
  ),
);
CommandInput.displayName = 'CommandInput';

export const CommandList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => <CommandPrimitive.List ref={ref} className={cn('max-h-[420px] overflow-y-auto overflow-x-hidden p-2 scrollbar-thin', className)} {...props} />,
);
CommandList.displayName = 'CommandList';

export const CommandEmpty = CommandPrimitive.Empty;

export const CommandGroup = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Group>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Group ref={ref} className={cn('overflow-hidden p-1 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-2', className)} {...props} />
  ),
);
CommandGroup.displayName = 'CommandGroup';

export const CommandItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Item
      ref={ref}
      className={cn('flex cursor-pointer select-none items-center gap-3 rounded-ctl px-3 py-2.5 text-[15px] outline-none data-[selected=true]:bg-brand-soft data-[selected=true]:text-ink [&_svg]:size-[18px] [&_svg]:text-muted', className)}
      {...props}
    />
  ),
);
CommandItem.displayName = 'CommandItem';
