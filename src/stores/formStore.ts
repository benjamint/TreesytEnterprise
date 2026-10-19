import type { FormRecord, OptionList, SurveyResponse } from '@/types';
import { defineStore } from './persistence';

/** Forms with their drafts and published versions, shared option lists, and responses (PRD G1–G2). */
export const useFormStore = defineStore(
  'forms',
  { forms: [] as FormRecord[], optionLists: [] as OptionList[], responses: [] as SurveyResponse[] },
  (s) => ({ forms: s.forms, optionLists: s.optionLists, responses: s.responses }),
  (set) => ({
    saveForm: (f: FormRecord) => set((st) => ({ forms: st.forms.some((x) => x.id === f.id) ? st.forms.map((x) => (x.id === f.id ? f : x)) : [f, ...st.forms] })),
    updateForm: (id: string, patch: Partial<FormRecord>) => set((st) => ({ forms: st.forms.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) })),
    removeForm: (id: string) => set((st) => ({ forms: st.forms.filter((x) => x.id !== id), responses: st.responses.filter((r) => r.formId !== id) })),
    addForms: (fs: FormRecord[], lists: OptionList[]) => set((st) => ({ forms: [...fs, ...st.forms], optionLists: [...lists, ...st.optionLists] })),
    saveOptionList: (l: OptionList) => set((st) => ({ optionLists: st.optionLists.some((x) => x.id === l.id) ? st.optionLists.map((x) => (x.id === l.id ? l : x)) : [...st.optionLists, l] })),
    removeOptionList: (id: string) => set((st) => ({ optionLists: st.optionLists.filter((x) => x.id !== id) })),
    addResponse: (r: SurveyResponse) => set((st) => ({ responses: [r, ...st.responses] })),
    updateResponse: (id: string, patch: Partial<SurveyResponse>) => set((st) => ({ responses: st.responses.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  }),
);
