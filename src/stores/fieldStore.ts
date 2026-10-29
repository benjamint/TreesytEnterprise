import type { AchievementRecord, AgentReport, AllowanceRun, BudgetRequest, CarryForward, CommissionPeriod, Geofence, PenaltyRun, Retirement, WeeklyPlan } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);
const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => Partial<T>)) =>
  list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x));

export interface FieldCollections {
  plans: WeeklyPlan[];
  budgets: BudgetRequest[];
  retirements: Retirement[];
  carryForwards: CarryForward[];
  penaltyRuns: PenaltyRun[];
  achievements: AchievementRecord[];
  allowanceRuns: AllowanceRun[];
  commissions: CommissionPeriod[];
  reports: AgentReport[];
  geofences: Geofence[];
}
type Key = keyof FieldCollections;
type Item<K extends Key> = FieldCollections[K][number];

/** Field team (PRD J1–J11): weekly plans, budgets, retirements, carry-forwards, allowances, commissions, reports. */
export const useFieldStore = defineStore(
  'field',
  { plans: [], budgets: [], retirements: [], carryForwards: [], penaltyRuns: [], achievements: [], allowanceRuns: [], commissions: [], reports: [], geofences: [] } as FieldCollections,
  (s) => ({
    plans: s.weeklyPlans, budgets: s.budgets, retirements: s.retirements, carryForwards: s.carryForwards, penaltyRuns: s.penaltyRuns, achievements: [],
    allowanceRuns: s.allowanceRuns, commissions: s.commissionPeriods, reports: s.agentReports, geofences: [],
  }),
  (set) => ({
    save: <K extends Key>(key: K, x: Item<K>) => set((st) => ({ [key]: upsert(st[key] as { id: string }[], x as { id: string }) }) as Partial<FieldCollections>),
    saveMany: <K extends Key>(key: K, xs: Item<K>[]) => set((st) => { const ids = new Set(xs.map((x) => (x as { id: string }).id)); return { [key]: [...xs, ...(st[key] as { id: string }[]).filter((x) => !ids.has(x.id))] } as Partial<FieldCollections>; }),
    patch: <K extends Key>(key: K, id: string, p: Partial<Item<K>> | ((x: Item<K>) => Partial<Item<K>>)) => set((st) => ({ [key]: patchIn(st[key] as never[], id, p as never) }) as Partial<FieldCollections>),
    remove: <K extends Key>(key: K, id: string) => set((st) => ({ [key]: (st[key] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<FieldCollections>),
  }),
);
