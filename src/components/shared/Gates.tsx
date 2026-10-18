import type { ReactElement, ReactNode } from 'react';
import { cloneElement } from 'react';
import type { ModuleKey } from '@/types';
import { Tip } from '@/components/ui/tooltip';
import { useCan, useModules, useT } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Every action checks a permission. Without it the control is hidden; in "View as" mode it is
 * shown disabled with a tooltip naming the missing permission (PRD principle 4).
 */
export function PermissionGate({ permission, children }: { permission: string; children: ReactElement<{ disabled?: boolean }> }) {
  const can = useCan();
  const viewAs = useSessionStore((s) => s.viewAs);
  const { t } = useT();
  if (can(permission)) return children;
  if (!viewAs) return null;
  return (
    <Tip label={t('common.missingPermission', { permission })}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed">
        {cloneElement(children, { disabled: true })}
      </span>
    </Tip>
  );
}

/** Modules switch whole areas on/off (PRD principle 5). */
export function ModuleGate({ module, children, fallback = null }: { module: ModuleKey; children: ReactNode; fallback?: ReactNode }) {
  const modules = useModules();
  return <>{modules[module] ? children : fallback}</>;
}
