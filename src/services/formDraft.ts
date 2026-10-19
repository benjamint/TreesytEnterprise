import type { FormSection, LogicGroup, Option, Question, QuestionType } from '@/engines/forms';
import { QUESTION_TYPES, questionKey } from '@/engines/forms';
import { latency } from '@/lib/utils';

/**
 * AI draft (PRD G1): describe a form → sections and questions to edit. A scripted topic library
 * covers the common field surveys; with VITE_ANTHROPIC_API_KEY set, Claude drafts it instead and
 * the result is checked against the question types before it reaches the builder.
 */

type L = { en: string; fr: string };
const l = (en: string, fr: string): L => ({ en, fr });
const o = (value: string, en: string, fr: string): Option => ({ value, label: l(en, fr) });
const when = (questionId: string, value: unknown): LogicGroup => ({ combinator: 'AND', conditions: [{ questionId, op: 'equals', value }] });
type Q = Omit<Question, 'id'> & { key: string };
const qq = (key: string, type: QuestionType, label: L, extra: Partial<Question> = {}): Q => ({ key, type, label, ...extra });

const TOPICS: { match: RegExp; title: L; questions: Q[] }[] = [
  { match: /household|family|members|ménage|famille/i, title: l('Household', 'Ménage'), questions: [
    qq('members', 'number', l('People in the household', 'Personnes dans le ménage'), { required: true, validation: { min: 1, max: 40 } }),
    qq('childrenCount', 'number', l('Children under 18', 'Enfants de moins de 18 ans'), { validation: { min: 0, max: 30 } }),
    qq('adults', 'calculated', l('Adults', 'Adultes'), { formula: 'members - childrenCount' }),
  ] },
  { match: /income|earn|money|sav|revenu|épargne/i, title: l('Income', 'Revenus'), questions: [
    qq('incomeSources', 'selectMany', l('Income sources', 'Sources de revenu'), { options: [o('farming', 'Farming', 'Agriculture'), o('trading', 'Trading', 'Commerce'), o('livestock', 'Livestock', 'Élevage'), o('wages', 'Wages', 'Salaire')], other: true }),
    qq('monthlyIncome', 'currency', l('Income last month', 'Revenu du mois dernier'), { validation: { min: 0 } }),
    qq('saves', 'yesNo', l('Saves money', 'Épargne')),
  ] },
  { match: /water|eau/i, title: l('Water', 'Eau'), questions: [
    qq('waterSource', 'selectOne', l('Drinking water source', 'Source d’eau potable'), { options: [o('borehole', 'Borehole', 'Forage'), o('well', 'Well', 'Puits'), o('river', 'River', 'Rivière'), o('pipe', 'Piped water', 'Eau courante')] }),
    qq('waterMinutes', 'number', l('Minutes to fetch water', 'Minutes pour aller chercher l’eau'), { validation: { min: 0, max: 300 } }),
  ] },
  { match: /train|workshop|session|formation|atelier|feedback|satisf/i, title: l('Feedback', 'Avis'), questions: [
    qq('overall', 'rating', l('Overall rating', 'Note globale'), { required: true, scale: { max: 5, style: 'stars' } }),
    qq('useful', 'likert', l('It was useful', 'C’était utile'), { scale: { max: 5, low: l('Disagree', 'Pas d’accord'), high: l('Agree', 'D’accord') } }),
    qq('recommend', 'nps', l('Would you recommend it?', 'Le recommanderiez-vous ?')),
    qq('comments', 'longText', l('Comments', 'Commentaires')),
  ] },
  { match: /tree|seedling|plant|arbre|plant/i, title: l('Trees', 'Arbres'), questions: [
    qq('treeCode', 'scanCode', l('Tree code', 'Code de l’arbre')),
    qq('alive', 'yesNo', l('Tree is alive', 'L’arbre est vivant'), { required: true }),
    qq('causeOfDeath', 'selectOne', l('Cause of death', 'Cause de mortalité'), { options: [o('drought', 'Drought', 'Sécheresse'), o('fire', 'Bush fire', 'Feu de brousse'), o('grazing', 'Grazing', 'Pâturage')], other: true }),
    qq('health', 'rating', l('Health', 'Santé'), { scale: { max: 5, style: 'stars' } }),
  ] },
  { match: /cocoa|cacao|plot|parcel|land|hectare|terre/i, title: l('Land', 'Terres'), questions: [
    qq('boundary', 'gpsPolygon', l('Walk the boundary', 'Parcourir la limite')),
    qq('areaHa', 'decimal', l('Area (ha)', 'Surface (ha)'), { validation: { min: 0, max: 200 } }),
    qq('tenure', 'selectOne', l('Land tenure', 'Régime foncier'), { options: [o('owned', 'Owned', 'Propriétaire'), o('family', 'Family land', 'Terre familiale'), o('rented', 'Rented', 'Location')] }),
  ] },
  { match: /child|school|labou?r|enfant|école/i, title: l('Children', 'Enfants'), questions: [
    qq('childrenWork', 'yesNo', l('Children under 15 work on the farm', 'Des enfants de moins de 15 ans travaillent au champ'), { required: true }),
    qq('childrenSchool', 'yesNo', l('All children attend school', 'Tous les enfants vont à l’école')),
  ] },
  { match: /health|clinic|sick|santé/i, title: l('Health', 'Santé'), questions: [
    qq('clinicMinutes', 'number', l('Minutes to the nearest clinic', 'Minutes jusqu’au centre de santé'), { validation: { min: 0 } }),
    qq('illness', 'yesNo', l('Someone was ill last month', 'Quelqu’un a été malade le mois dernier')),
  ] },
  { match: /women|gender|female|femme/i, title: l('Women', 'Femmes'), questions: [
    qq('womenDecide', 'yesNo', l('Women decide how crop money is spent', 'Les femmes décident de l’usage de l’argent des récoltes')),
    qq('womenGroup', 'yesNo', l('Belongs to a women’s group', 'Membre d’un groupement de femmes')),
  ] },
  { match: /price|sell|market|buyer|prix|vente/i, title: l('Sales', 'Ventes'), questions: [
    qq('pricePaid', 'currency', l('Price received per kg', 'Prix reçu par kg'), { validation: { min: 0 } }),
    qq('priceSatisfaction', 'likert', l('Satisfied with the price', 'Satisfait du prix'), { scale: { max: 5 } }),
  ] },
];

const TAIL: Q[] = [qq('photo', 'image', l('Photo', 'Photo'), { media: { max: 1 } }), qq('gps', 'gpsPoint', l('Location', 'Emplacement'))];

function finish(sections: { title: L; questions: Q[] }[]): FormSection[] {
  const taken = new Set<string>();
  return sections.map((s, si) => ({
    id: `s${si + 1}`, title: s.title,
    questions: s.questions.map((x) => {
      const id = taken.has(x.key) ? questionKey(x.label.en ?? x.key, taken) : x.key;
      taken.add(id);
      const { key: _key, ...rest } = x;
      void _key;
      return { ...rest, id };
    }),
  }));
}

export function draftFormSync(description: string): { sections: FormSection[]; topics: string[] } {
  const hits = TOPICS.filter((t) => t.match.test(description));
  const picked = hits.length ? hits : [TOPICS.find((t) => t.title.en === 'Feedback')!];
  const consent = /survey|interview|consent|enquête|questionnaire|baseline/i.test(description);
  const sections = [
    ...(consent ? [{ title: l('Consent', 'Consentement'), questions: [qq('consent', 'yesNo', l('The person agrees to take part', 'La personne accepte de participer'), { required: true, jump: { when: when('consent', false), to: 'END' } })] }] : []),
    ...picked.map((t) => ({
      title: t.title,
      questions: t.questions.map((x) => (x.key === 'causeOfDeath' ? { ...x, showIf: when('alive', false) } : x)),
    })),
    ...(/photo|gps|location|visit|visite/i.test(description) ? [{ title: l('Location and photo', 'Position et photo'), questions: TAIL }] : []),
  ];
  return { sections: finish(sections), topics: picked.map((t) => t.title.en) };
}

/** Check a model's draft against the engine before it reaches the builder. */
export function sanitizeDraft(raw: unknown): FormSection[] | null {
  if (!Array.isArray(raw)) return null;
  const taken = new Set<string>();
  const sections = raw.slice(0, 8).map((s: { title?: string; questions?: unknown[] }, si) => ({
    id: `s${si + 1}`,
    title: { en: String(s?.title ?? `Section ${si + 1}`) },
    questions: (Array.isArray(s?.questions) ? s.questions : []).slice(0, 15).flatMap((x) => {
      const q = x as { label?: string; type?: string; options?: string[]; required?: boolean };
      if (!q?.label || !QUESTION_TYPES.includes(q.type as QuestionType) || ['repeatGroup', 'table', 'calculated'].includes(String(q.type))) return [];
      const id = questionKey(q.label, taken);
      taken.add(id);
      const options = Array.isArray(q.options) ? q.options.slice(0, 12).map((v) => ({ value: questionKey(String(v), new Set()), label: { en: String(v) } })) : undefined;
      return [{ id, type: q.type as QuestionType, label: { en: q.label }, required: !!q.required, ...(options?.length ? { options } : {}) }];
    }),
  })).filter((s) => s.questions.length);
  return sections.length ? sections : null;
}

async function draftWithModel(description: string, apiKey: string): Promise<FormSection[] | null> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const request = {
    model: 'claude-opus-5-5',
    max_tokens: 3000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: `You design mobile data-collection forms for agricultural field agents. Reply with JSON only: an array of sections, each {"title": string, "questions": [{"label": string, "type": one of ${QUESTION_TYPES.filter((t) => !['repeatGroup', 'table', 'calculated'].includes(t)).join(', ')}, "required": boolean, "options"?: string[]}]}. Keep it to at most 5 sections and 25 questions, with short plain-language labels.`,
    messages: [{ role: 'user' as const, content: description }],
  };
  try {
    const response = await client.beta.messages.create(request as unknown as Parameters<typeof client.beta.messages.create>[0]) as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
    if (response.stop_reason !== 'end_turn') return null;
    const text = response.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    return sanitizeDraft(JSON.parse(json));
  } catch (error) {
    if (error instanceof Anthropic.APIError || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function draftForm(description: string): Promise<{ sections: FormSection[]; topics: string[]; source: 'model' | 'scripted' }> {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (key) {
    const sections = await draftWithModel(description, key);
    if (sections) return { sections, topics: sections.map((s) => s.title.en ?? ''), source: 'model' };
  }
  await latency(900, 1400);
  return { ...draftFormSync(description), source: 'scripted' };
}
