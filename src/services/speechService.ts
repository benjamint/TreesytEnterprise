import { latency } from '@/lib/utils';

/** Simulated speech recognition (PRD 4.4): scripted transcripts after a 3 s waveform. */
const SCRIPTS: Record<string, string> = {
  tw: '{name}, nkuto kilo {kg}',
  dag: '{name}, kpihi kilo {kg}',
  ha: '{name}, kadanya kilo {kg}',
  fr: '{name}, {kg} kilos',
};
export const SPEECH_LANGS = ['tw', 'dag', 'ha', 'fr'] as const;
export type SpeechLang = (typeof SPEECH_LANGS)[number];

/** "Hears" the agent say the farmer's name and the weight; returns the transcript and the parsed values. */
export async function transcribe(lang: SpeechLang, heard: { name: string; kg: number }): Promise<{ text: string; name: string; quantityKg: number }> {
  await latency(3000, 3000);
  const text = (SCRIPTS[lang] ?? SCRIPTS.tw!).replace('{name}', heard.name).replace('{kg}', String(heard.kg));
  return { text, ...parse(text) };
}

/** Pulls "name, … number" out of a transcript (the name before the comma, the first number as kg). */
export function parse(text: string): { name: string; quantityKg: number } {
  const [name = '', rest = ''] = text.split(',');
  const kg = Number(rest.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.') ?? 0);
  return { name: name.trim(), quantityKg: kg };
}
