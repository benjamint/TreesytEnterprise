import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, icon: Icon, onClick, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; onClick?: () => void; className?: string }) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn('flex min-h-[132px] flex-col justify-between rounded-card border border-line bg-surface p-6 text-left shadow-soft', onClick && 'transition-colors hover:border-brand/40', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon className="h-[18px] w-[18px] text-muted" aria-hidden="true" />}
      </div>
      <div>
        <div className="tnum text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{value}</div>
        {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
      </div>
    </Comp>
  );
}
