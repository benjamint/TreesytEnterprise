import type { AiAnswer } from '@/services/aiAssistant';
import { defineStore } from './persistence';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: AiAnswer;
  at: string;
}

export interface AiConversation {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  at: string;
  messages: AiMessage[];
}

/** "Ask your operations" history, per person and company (PRD B2). */
export const useAiStore = defineStore('ai', { conversations: [] as AiConversation[] }, () => ({ conversations: [] }), (set) => ({
  startConversation: (c: AiConversation) => set((st) => ({ conversations: [c, ...st.conversations].slice(0, 60) })),
  appendMessage: (id: string, m: AiMessage) =>
    set((st) => ({ conversations: st.conversations.map((c) => (c.id === id ? { ...c, at: m.at, messages: [...c.messages, m] } : c)) })),
  removeConversation: (id: string) => set((st) => ({ conversations: st.conversations.filter((c) => c.id !== id) })),
}));
