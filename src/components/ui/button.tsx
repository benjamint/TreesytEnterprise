import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-inner hover:bg-brand-hover',
        secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
        ghost: 'text-ink hover:bg-brand-soft/70',
        danger: 'bg-danger text-white hover:bg-danger/90',
        dangerOutline: 'border border-danger/40 text-danger bg-surface hover:bg-danger/5',
        link: 'text-ink underline underline-offset-[3px] decoration-1 hover:text-brand px-0 h-auto',
      },
      size: {
        lg: 'h-[52px] px-6 text-[15px]',
        md: 'h-11 px-4 text-[15px]',
        sm: 'h-10 px-3.5 text-sm',
        xs: 'h-8 px-2.5 text-[13px] rounded-chip',
        icon: 'h-10 w-10',
        iconSm: 'h-8 w-8 rounded-chip',
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
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';
