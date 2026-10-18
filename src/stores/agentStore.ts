import type { Agent } from '@/types';
import { defineStore } from './persistence';

export const useAgentStore = defineStore('agents', { agents: [] as Agent[] }, (s) => ({ agents: s.agents }), () => ({}));
