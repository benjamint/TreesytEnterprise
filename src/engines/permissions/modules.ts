import type { ModuleKey } from '@/types';

export interface ModuleDef {
  key: ModuleKey;
  /** Modules that must be on for this one to work (warning in Settings → Plan & modules). */
  dependsOn?: ModuleKey[];
  /** Core modules cannot be switched off. */
  core?: boolean;
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', core: true },
  { key: 'ai' },
  { key: 'farmers' },
  { key: 'dataQuality', dependsOn: ['farmers'] },
  { key: 'imports' },
  { key: 'buying', dependsOn: ['farmers'] },
  { key: 'aggregators', dependsOn: ['buying'] },
  { key: 'payments' },
  { key: 'support', dependsOn: ['farmers'] },
  { key: 'recovery', dependsOn: ['support'] },
  { key: 'inventory' },
  { key: 'dispatch', dependsOn: ['inventory'] },
  { key: 'salesContracts' },
  { key: 'traceboard' },
  { key: 'nurseries' },
  { key: 'trees' },
  { key: 'plots' },
  { key: 'eudr', dependsOn: ['plots'] },
  { key: 'carbon', dependsOn: ['trees'] },
  { key: 'forms' },
  { key: 'workshops' },
  { key: 'fieldTeam' },
  { key: 'weeklyBudgets', dependsOn: ['fieldTeam'] },
  { key: 'allowances', dependsOn: ['fieldTeam'] },
  { key: 'commissions', dependsOn: ['fieldTeam'] },
  { key: 'reports', core: true },
  { key: 'notifications', core: true },
  { key: 'system', core: true },
];

export const ALL_MODULE_KEYS = MODULES.map((m) => m.key);

export function allModules(on = true): Record<ModuleKey, boolean> {
  return Object.fromEntries(ALL_MODULE_KEYS.map((k) => [k, on])) as Record<ModuleKey, boolean>;
}

export function missingDependencies(modules: Record<ModuleKey, boolean>): { module: ModuleKey; needs: ModuleKey[] }[] {
  return MODULES.filter((m) => modules[m.key] && m.dependsOn?.some((d) => !modules[d])).map((m) => ({
    module: m.key,
    needs: (m.dependsOn ?? []).filter((d) => !modules[d]),
  }));
}
