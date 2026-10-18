import { Check, Circle } from 'lucide-react';
import type { OrgSettings } from '@/types';
import { passwordFailures } from '@/services/authPolicy';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/** The company's password policy with live ticks (PRD A2 "new password with company policy shown"). */
export function PolicyList({ password, policy }: { password: string; policy: OrgSettings['security']['passwordPolicy'] }) {
  const { t } = useT();
  const failing = new Set(passwordFailures(password, policy));
  const rules = [
    ['minLength', true],
    ['number', policy.requireNumber],
    ['symbol', policy.requireSymbol],
    ['mixedCase', policy.requireMixedCase],
  ] as const;
  return (
    <ul className="space-y-1.5 rounded-ctl bg-canvas px-4 py-3" aria-label={t('auth.policyTitle')}>
      {rules.filter(([, on]) => on).map(([rule]) => {
        const ok = password.length > 0 && !failing.has(rule);
        return (
          <li key={rule} className={cn('flex items-center gap-2 text-[13px]', ok ? 'text-success' : 'text-muted')}>
            {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Circle className="h-3.5 w-3.5" />}
            {t(`auth.rule.${rule}`, { count: policy.minLength })}
          </li>
        );
      })}
    </ul>
  );
}
