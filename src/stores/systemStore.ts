import type { Device, ExportJob, JobRun, KbArticle, SavedReport, SyncLog } from '@/types';
import { defineStore } from './persistence';

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list]);

/** Reports, exports, sync logs, devices, job runs and help articles (PRD K1–K8). */
export const useSystemStore = defineStore(
  'system',
  { syncLogs: [] as SyncLog[], devices: [] as Device[], reports: [] as SavedReport[], exports: [] as ExportJob[], jobRuns: [] as JobRun[], articles: [] as KbArticle[] },
  (s) => ({ syncLogs: s.syncLogs, devices: s.devices, reports: s.savedReports, exports: [], jobRuns: s.jobRuns, articles: s.articles }),
  (set) => ({
    addSyncLogs: (xs: SyncLog[]) => set((st) => ({ syncLogs: [...xs, ...st.syncLogs] })),
    purgeSyncLogs: (ids: Set<string>) => set((st) => ({ syncLogs: st.syncLogs.filter((x) => !ids.has(x.id)) })),
    saveDevice: (x: Device) => set((st) => ({ devices: upsert(st.devices, x) })),
    saveReport: (x: SavedReport) => set((st) => ({ reports: upsert(st.reports, x) })),
    removeReport: (id: string) => set((st) => ({ reports: st.reports.filter((x) => x.id !== id) })),
    saveExport: (x: ExportJob) => set((st) => ({ exports: upsert(st.exports, x) })),
    addJobRun: (x: JobRun) => set((st) => ({ jobRuns: [x, ...st.jobRuns].slice(0, 400) })),
    saveArticle: (x: KbArticle) => set((st) => ({ articles: upsert(st.articles, x) })),
    removeArticle: (id: string) => set((st) => ({ articles: st.articles.filter((x) => x.id !== id) })),
  }),
);
