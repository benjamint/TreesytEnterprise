import type { Client, DispatchOrder, InsightRequest, Plot, SalesContract } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);
const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => Partial<T>)) =>
  list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x));

/** Clients, sales contracts, dispatch orders, buyer insight requests and mapped plots (PRD H6–H8). */
export const useSalesStore = defineStore(
  'sales',
  { clients: [] as Client[], contracts: [] as SalesContract[], dispatches: [] as DispatchOrder[], insights: [] as InsightRequest[], plots: [] as Plot[] },
  (s) => ({ clients: s.clients, contracts: s.salesContracts, dispatches: s.dispatches, insights: s.insights, plots: s.plots }),
  (set) => ({
    saveClient: (x: Client) => set((st) => ({ clients: upsert(st.clients, x) })),
    saveContract: (x: SalesContract) => set((st) => ({ contracts: upsert(st.contracts, x) })),
    updateContract: (id: string, patch: Partial<SalesContract> | ((x: SalesContract) => Partial<SalesContract>)) => set((st) => ({ contracts: patchIn(st.contracts, id, patch) })),
    saveDispatch: (x: DispatchOrder) => set((st) => ({ dispatches: upsert(st.dispatches, x) })),
    updateDispatch: (id: string, patch: Partial<DispatchOrder> | ((x: DispatchOrder) => Partial<DispatchOrder>)) => set((st) => ({ dispatches: patchIn(st.dispatches, id, patch) })),
    saveInsight: (x: InsightRequest) => set((st) => ({ insights: upsert(st.insights, x) })),
  }),
);
