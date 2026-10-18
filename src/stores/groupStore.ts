import type { FarmerGroup, GroupMembership } from '@/types';
import { defineStore } from './persistence';

export const useGroupStore = defineStore(
  'groups',
  { groups: [] as FarmerGroup[], groupMemberships: [] as GroupMembership[] },
  (s) => ({ groups: s.groups, groupMemberships: s.groupMemberships }),
  () => ({}),
);
