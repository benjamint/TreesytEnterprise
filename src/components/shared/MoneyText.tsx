import type { Money } from '@/types';
import { useFormat } from '@/stores/hooks';
import { cn } from '@/lib/utils';

/** Money is only ever displayed through formatMoney() (PRD principle 6). */
export function MoneyText({ value, compact, className }: { value: Money | number; compact?: boolean; className?: string }) {
  const f = useFormat();
  return <span className={cn('tnum whitespace-nowrap', className)}>{f.money(value, { compact })}</span>;
}
