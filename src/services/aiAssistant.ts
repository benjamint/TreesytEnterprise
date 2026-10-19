import { AI_INTENTS, matchIntent, type AiContext, type AiIntent, type AiResult } from '@/data/ai-intents';
import { hasPermission } from '@/engines/permissions';
import { latency } from '@/lib/utils';
import { useAccessStore } from '@/stores/accessStore';
import { useAgentStore } from '@/stores/agentStore';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useGroupStore } from '@/stores/groupStore';
import { useLoanStore } from '@/stores/loanStore';
import { useLocationStore } from '@/stores/locationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { workflowUser } from './workflowService';

/**
 * "Ask your operations" (PRD B2, 4.4): scripted intents over the company's own data, with the
 * same permission and module checks as the screens. If no intent matches and a key is set in
 * VITE_ANTHROPIC_API_KEY, the question goes to Claude with a company summary as context.
 */

export interface AiAnswer extends Partial<AiResult> {
  intent: string;
  status: 'ok' | 'empty' | 'module' | 'permission' | 'unknown' | 'llm' | 'error';
  /** Free-text answer from the model (status 'llm'). */
  text?: string;
  module?: string;
  permission?: string;
}

const own = <T extends { orgId: string }>(rows: T[], orgId: string) => rows.filter((r) => r.orgId === orgId);

export function buildContext(orgId: string, userId: string, lang: 'en' | 'fr', now = new Date()): AiContext {
  const b = useBuyingStore.getState();
  const p = usePaymentStore.getState();
  const users = useAccessStore.getState().users;
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    orgId, userId, lang, now,
    me: workflowUser(userId, orgId),
    settings: useSettingsStore.getState().settings[orgId]!,
    userName: (id) => names.get(id) ?? id,
    requests: own(b.requests, orgId), purchases: own(b.purchases, orgId), expenses: own(b.expenses, orgId),
    aggregatorPurchases: own(b.aggregatorPurchases, orgId), suppliers: own(b.suppliers, orgId), bags: own(b.bags, orgId),
    payments: own(p.payments, orgId), wallets: own(p.wallets, orgId),
    agents: own(useAgentStore.getState().agents, orgId), communities: own(useCommunityStore.getState().communities, orgId),
    farmers: own(useFarmerStore.getState().farmers, orgId), groups: own(useGroupStore.getState().groups, orgId),
    loans: own(useLoanStore.getState().loans, orgId), nodes: own(useLocationStore.getState().nodes, orgId),
    warehouses: own(useWarehouseStore.getState().warehouses, orgId),
  };
}

function planCeiling(orgId: string): string[] {
  const { orgs, plans } = usePlatformStore.getState();
  const planId = orgs.find((o) => o.id === orgId)?.planId;
  return plans.find((x) => x.id === planId)?.permissionCeiling ?? ['*'];
}

/** Run one intent with the company's module and the user's permission checks. */
export function runIntent(intent: AiIntent, ctx: AiContext): AiAnswer {
  if (intent.module && !ctx.settings.modules[intent.module]) return { intent: intent.key, status: 'module', module: intent.module, links: [] };
  if (!hasPermission(ctx.me.permissions, intent.permission) || !hasPermission(planCeiling(ctx.orgId), intent.permission))
    return { intent: intent.key, status: 'permission', permission: intent.permission, links: [] };
  const res = intent.run(ctx);
  return { intent: intent.key, status: res.empty ? 'empty' : 'ok', ...res };
}

/** Intents this user can actually ask in this company (for suggestions). */
export function availableIntents(ctx: AiContext): AiIntent[] {
  return AI_INTENTS.filter((i) => (!i.module || ctx.settings.modules[i.module]) && hasPermission(ctx.me.permissions, i.permission));
}

export function askSync(question: string, orgId: string, userId: string, lang: 'en' | 'fr'): AiAnswer {
  const intent = matchIntent(question);
  if (!intent) return { intent: 'none', status: 'unknown', links: [] };
  return runIntent(intent, buildContext(orgId, userId, lang));
}

/** Summary sent to the model when no scripted intent matches. Only this company's figures. */
function companySummary(ctx: AiContext): string {
  const lines = availableIntents(ctx)
    .map((i) => ({ key: i.key, res: runIntent(i, ctx) }))
    .filter((x) => x.res.status === 'ok')
    .map((x) => `${x.key}: ${JSON.stringify(x.res.params)} rows=${JSON.stringify(x.res.table?.rows.slice(0, 5) ?? [])}`);
  const org = usePlatformStore.getState().orgs.find((o) => o.id === ctx.orgId);
  return [`Company: ${org?.name} (${org?.currency}; money values are in minor units of ${org?.currency})`, ...lines].join('\n');
}

async function askModel(question: string, ctx: AiContext, apiKey: string): Promise<AiAnswer> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const request = {
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: `You answer questions about one agricultural sourcing company using only the figures below. If the figures don't answer the question, say so briefly and suggest a question that can be answered. Reply in ${ctx.lang === 'fr' ? 'French' : 'English'}, in two sentences at most, without markdown.\n\n${companySummary(ctx)}`,
    messages: [{ role: 'user' as const, content: question }],
  };
  try {
    const response = await client.beta.messages.create(request as unknown as Parameters<typeof client.beta.messages.create>[0]) as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
    if (response.stop_reason === 'refusal') return { intent: 'llm', status: 'unknown', links: [] };
    const text = response.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
    return text ? { intent: 'llm', status: 'llm', text, links: [] } : { intent: 'llm', status: 'unknown', links: [] };
  } catch (error) {
    if (error instanceof Anthropic.APIError) return { intent: 'llm', status: 'error', links: [] };
    throw error;
  }
}

/** Ask with "thinking" latency; falls back to the model only when configured. */
export async function ask(question: string, orgId: string, userId: string, lang: 'en' | 'fr'): Promise<AiAnswer> {
  await latency(500, 900);
  const answer = askSync(question, orgId, userId, lang);
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (answer.status === 'unknown' && key) return askModel(question, buildContext(orgId, userId, lang), key);
  return answer;
}
