import { useMemo } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { useAccessStore } from '@/stores/accessStore';
import { useActor, useOrgSettings } from '@/stores/hooks';
import { TILES } from '@/mobile/flows/catalog';

/** The signed-in field user's agent record, membership and allowed tiles. */
export function useMobileAgent() {
  const { userId, orgId } = useActor();
  const agents = useAgentStore((s) => s.agents);
  const memberships = useAccessStore((s) => s.memberships);
  const settings = useOrgSettings();
  return useMemo(() => {
    const agent = agents.find((a) => a.userId === userId && a.orgId === orgId);
    const membership = memberships.find((m) => m.userId === userId && m.orgId === orgId);
    const type = settings.agentTypes.find((t) => t.id === agent?.agentTypeId);
    const allowed = type?.mobileTiles ?? ['farmers', 'surveys'];
    const tiles = TILES.filter((tile) => allowed.includes(tile.key) && settings.modules[tile.module]);
    return { agent, membership, type, tiles };
  }, [agents, memberships, settings, userId, orgId]);
}
