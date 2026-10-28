import type { LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
      data-tour="stat"
      className={cn('flex min-h-[132px] flex-col justify-between rounded-card border border-line bg-surface p-6 text-left shadow-soft', onClick && 'transition-colors hover:border-brand/40', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon className="h-[18px] w-[18px] text-muted" aria-hidden="true" />}
      </div>
      <div>
        <div className="tnum text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink"><CountUp value={value} /></div>
        {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
      </div>
    </Comp>
  );
}

/** Stat count-up (PRD 6.3): whole numbers like "1,119" or "1 119" count up once; anything else shows as is. */
export function CountUp({ value }: { value: ReactNode }) {
  const m = typeof value === 'string' ? /^(\d{1,3}(?:([,\s\u202f\u00a0])\d{3})*|\d+)$/.exec(value) : null;
  const target = m ? Number(m[1]!.replace(/[^\d]/g, '')) : 0;
  const sep = m?.[2] ?? (typeof value === 'string' && value.length > 3 ? ',' : '');
  const reduce = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || navigator.webdriver);
  const [n, setN] = useState(m && !reduce && target > 9 ? 0 : target);
  useEffect(() => {
    if (!m || reduce || target <= 9) { setN(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 600);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  if (!m) return <>{value}</>;
  return <>{String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)}</>;
}
