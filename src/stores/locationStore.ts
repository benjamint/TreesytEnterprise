import type { LocationNode } from '@/types';
import { defineStore } from './persistence';

export const useLocationStore = defineStore('locations', { nodes: [] as LocationNode[] }, (s) => ({ nodes: s.nodes }), () => ({}));
