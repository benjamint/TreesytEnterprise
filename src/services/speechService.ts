import { latency } from '@/lib/utils';

/** Simulated speech recognition (PRD 4.4): scripted transcripts after a 3 s waveform (phase 9). */
const SCRIPTS: Record<string, string> = {
  tw: 'Abena Issah, shea nkuto kilo ɔha ne aduonum',
  dag: 'Abena Issah, kpihi kilo kɔbga ni pihinu',
  ha: 'Abena Issah, kadanya kilo ɗari da hamsin',
  fr: 'Aya Kouassi, cacao cent cinquante kilos',
};
export async function transcribe(lang: keyof typeof SCRIPTS): Promise<{ text: string; quantityKg: number }> {
  await latency(3000, 3000);
  return { text: SCRIPTS[lang] ?? SCRIPTS.tw!, quantityKg: 150 };
}
