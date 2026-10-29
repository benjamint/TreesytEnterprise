import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand shadow-inner hover:bg-brand-hover',
        secondary: 'bg-surface text-ink border border-line-strong shadow-xs hover:bg-subtle hover:border-muted/40',
        ghost: 'text-body hover:bg-canvas hover:text-ink',
        danger: 'bg-danger text-white shadow-inner hover:bg-danger/90 dark:text-canvas',
        dangerOutline: 'border border-danger/35 text-danger bg-surface shadow-xs hover:bg-danger/5',
        link: 'text-ink underline underline-offset-[3px] decoration-1 hover:text-brand px-0 h-auto',
      },
      size: {
        lg: 'h-btn-lg px-5 text-[15px]',
        md: 'h-btn px-3.5 text-[14px] [.mobile-ui_&]:text-[15px]',
        sm: 'h-btn-sm px-3 text-[13px]',
        xs: 'h-btn-xs px-2.5 text-[12px] rounded-chip',
        icon: 'h-btn w-btn',
        iconSm: 'h-btn-sm w-btn-sm rounded-chip',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} data-variant={variant ?? 'primary'} ref={ref} {...props} />;
});
Button.displayName = 'Button';
