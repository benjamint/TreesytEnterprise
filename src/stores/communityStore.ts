import type { Community } from '@/types';
import { defineStore } from './persistence';

export const useCommunityStore = defineStore('communities', { communities: [] as Community[] }, (s) => ({ communities: s.communities }), () => ({}));
