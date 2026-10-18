import { useMemo } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useSettingsStore } from '@/stores/settingsStore';

/** Per-company usage numbers for the platform console. */
export function usePlatformStats() {
  const agents = useAgentStore((s) => s.agents);
  const farmers = useFarmerStore((s) => s.farmers);
  const settings = useSettingsStore((s) => s.settings);
  return useMemo(() => {
    const by = <T extends { orgId: string }>(rows: T[]) => rows.reduce<Record<string, number>>((m, r) => ((m[r.orgId] = (m[r.orgId] ?? 0) + 1), m), {});
    const activeAgents = by(agents.filter((a) => a.status === 'ACTIVE'));
    const farmerCount = by(farmers);
    const modules = Object.fromEntries(Object.entries(settings).map(([id, s]) => [id, Object.values(s.modules).filter(Boolean).length]));
    return { activeAgents, farmerCount, modules };
  }, [agents, farmers, settings]);
}
