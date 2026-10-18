import type { Farmer } from '@/types';
import { defineStore } from './persistence';

export const useFarmerStore = defineStore('farmers', { farmers: [] as Farmer[] }, (s) => ({ farmers: s.farmers }), () => ({}));
