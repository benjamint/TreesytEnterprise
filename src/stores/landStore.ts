import type { CarbonProject, DueDiligenceStatement, EudrLot, ForestLossZone, Nursery, Plot, SeedlingAllocation, SeedlingLot, Tree } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);
const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => Partial<T>)) =>
  list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: new Date().toISOString() } : x));
type Patch<T> = Partial<T> | ((x: T) => Partial<T>);

/** Nurseries, seedlings, trees, plots, the forest-loss layer, EUDR lots and statements, carbon projects (PRD I1–I6). */
export const useLandStore = defineStore(
  'land',
  {
    nurseries: [] as Nursery[], lots: [] as SeedlingLot[], allocations: [] as SeedlingAllocation[], trees: [] as Tree[], plots: [] as Plot[],
    lossZones: [] as ForestLossZone[], eudrLots: [] as EudrLot[], statements: [] as DueDiligenceStatement[], projects: [] as CarbonProject[],
  },
  (s) => ({
    nurseries: s.nurseries, lots: s.seedlingLots, allocations: s.seedlingAllocations, trees: s.trees, plots: s.plots,
    lossZones: s.lossZones, eudrLots: s.eudrLots, statements: s.statements, projects: s.carbonProjects,
  }),
  (set) => ({
    saveNursery: (x: Nursery) => set((st) => ({ nurseries: upsert(st.nurseries, x) })),
    updateNursery: (id: string, p: Patch<Nursery>) => set((st) => ({ nurseries: patchIn(st.nurseries, id, p) })),
    saveLot: (x: SeedlingLot) => set((st) => ({ lots: upsert(st.lots, x) })),
    saveAllocation: (x: SeedlingAllocation) => set((st) => ({ allocations: upsert(st.allocations, x) })),
    updateAllocation: (id: string, p: Patch<SeedlingAllocation>) => set((st) => ({ allocations: patchIn(st.allocations, id, p) })),
    saveTrees: (xs: Tree[]) => set((st) => { const ids = new Set(xs.map((x) => x.id)); return { trees: [...xs, ...st.trees.filter((x) => !ids.has(x.id))] }; }),
    updateTree: (id: string, p: Patch<Tree>) => set((st) => ({ trees: patchIn(st.trees, id, p) })),
    savePlot: (x: Plot) => set((st) => ({ plots: upsert(st.plots, x) })),
    updatePlot: (id: string, p: Patch<Plot>) => set((st) => ({ plots: patchIn(st.plots, id, p) })),
    updatePlots: (ids: string[], p: (x: Plot) => Partial<Plot>) => set((st) => { const s = new Set(ids); const at = new Date().toISOString(); return { plots: st.plots.map((x) => (s.has(x.id) ? { ...x, ...p(x), updatedAt: at } : x)) }; }),
    saveEudrLot: (x: EudrLot) => set((st) => ({ eudrLots: upsert(st.eudrLots, x) })),
    saveStatement: (x: DueDiligenceStatement) => set((st) => ({ statements: upsert(st.statements, x) })),
    updateStatement: (id: string, p: Patch<DueDiligenceStatement>) => set((st) => ({ statements: patchIn(st.statements, id, p) })),
    saveProject: (x: CarbonProject) => set((st) => ({ projects: upsert(st.projects, x) })),
    updateProject: (id: string, p: Patch<CarbonProject>) => set((st) => ({ projects: patchIn(st.projects, id, p) })),
  }),
);
