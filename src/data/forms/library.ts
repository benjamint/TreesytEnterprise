import type { FormBindingKey, FormRecord, OptionList } from '@/types';
import type { FormBinding, FormSchema, FormSection, LogicGroup, Option, Question } from '@/engines/forms';
import { ORG } from '@/data/seed/templates';
import { COMMUNITY, GENERIC_FARMER, GROUP, KAKAO_FARMER, VITARA_FARMER, l, opt, q, yes, type L } from './profiles';

/**
 * The forms each company starts with (PRD 12: Vitara 12 forms incl. profile forms) and the shared
 * option lists they use. Profile forms keep their history: Vitara's farmer profile is on v3.
 */

export function formPrefix(orgId: string): string {
  return orgId === ORG.vitara ? 'vit' : orgId === ORG.kakao ? 'ki' : orgId;
}
export const formId = (orgId: string, key: string) => `${formPrefix(orgId)}_frm_${key}`;
export const listId = (orgId: string, key: string) => `${formPrefix(orgId)}_ol_${key}`;

/** Settings → Forms binding key for each engine binding. */
export const BINDING_KEY: Partial<Record<FormBinding, FormBindingKey>> = {
  farmerProfile: 'farmer', communityProfile: 'community', groupProfile: 'farmerGroup', nurseryProfile: 'nursery', plotProfile: 'plot',
  plotMonitoring: 'plotMonitoring', treeMonitoring: 'treeMonitoring', nurseryMonitoring: 'nurseryMonitoring', workshopFeedback: 'workshopFeedback',
  recoveryFeedback: 'recoveryFeedback', agentReport: 'agentReport',
};
export const BINDING_OF_KEY = Object.fromEntries(Object.entries(BINDING_KEY).map(([b, k]) => [k, b])) as Record<FormBindingKey, FormBinding>;

const FORM_KEY: Partial<Record<FormBinding, string>> = {
  farmerProfile: 'farmer', communityProfile: 'community', groupProfile: 'group', nurseryProfile: 'nursery', plotProfile: 'plot',
  treeMonitoring: 'treemon', nurseryMonitoring: 'nurserymon', workshopFeedback: 'workshop', recoveryFeedback: 'recovery', agentReport: 'agentreport',
};

const SEEDED: Record<string, FormBinding[]> = {
  vit: ['farmerProfile', 'communityProfile', 'groupProfile', 'nurseryProfile', 'plotProfile', 'treeMonitoring', 'nurseryMonitoring', 'workshopFeedback', 'recoveryFeedback', 'agentReport'],
  ki: ['farmerProfile', 'communityProfile', 'groupProfile', 'plotProfile', 'workshopFeedback'],
  other: ['farmerProfile', 'communityProfile', 'groupProfile', 'workshopFeedback'],
};
const seededBindings = (orgId: string) => SEEDED[formPrefix(orgId)] ?? SEEDED.other!;

/** Which form serves each record type, for Settings → Forms. */
export function formBindingsFor(orgId: string): Partial<Record<FormBindingKey, string>> {
  return Object.fromEntries(seededBindings(orgId).map((b) => [BINDING_KEY[b]!, formId(orgId, FORM_KEY[b]!)]));
}

// ---------------------------------------------------------------- Option lists

const o = opt;
const list = (key: string, name: L, options: Option[]) => ({ key, name, options });

const SHARED = {
  crops: list('crops', l('Crops', 'Cultures'), [o('shea', 'Shea', 'Karité'), o('maize', 'Maize', 'Maïs'), o('soybeans', 'Soybeans', 'Soja'), o('groundnuts', 'Groundnuts', 'Arachides'), o('millet', 'Millet', 'Mil'), o('sorghum', 'Sorghum', 'Sorgho'), o('cowpea', 'Cowpea', 'Niébé'), o('yam', 'Yam', 'Igname'), o('sesame', 'Sesame', 'Sésame')]),
  idTypes: list('idTypes', l('ID types', 'Types de pièce'), [o('ghanaCard', 'Ghana Card', 'Carte Ghana'), o('votersId', 'Voter’s ID', 'Carte d’électeur'), o('nhis', 'NHIS card', 'Carte NHIS'), o('none', 'None', 'Aucune')]),
  education: list('education', l('Education levels', 'Niveaux d’études'), [o('none', 'None', 'Aucun'), o('primary', 'Primary', 'Primaire'), o('jhs', 'Junior high', 'Collège'), o('shs', 'Senior high', 'Lycée'), o('tertiary', 'Tertiary', 'Supérieur')]),
  languages: list('languages', l('Languages', 'Langues'), ['Waale', 'Dagaare', 'Dagbani', 'Sisaali', 'Gonja', 'Mampruli', 'Twi', 'Ewe'].map((x) => o(x, x, x))),
  marital: list('marital', l('Marital status', 'Situation matrimoniale'), [o('married', 'Married', 'Marié(e)'), o('single', 'Single', 'Célibataire'), o('widowed', 'Widowed', 'Veuf/veuve'), o('divorced', 'Divorced', 'Divorcé(e)')]),
  income: list('income', l('Income sources', 'Sources de revenu'), [o('farming', 'Farming', 'Agriculture'), o('sheaPicking', 'Shea picking', 'Ramassage de karité'), o('sheaButterProcessing', 'Shea butter processing', 'Transformation du beurre de karité'), o('trading', 'Trading', 'Commerce'), o('pettyTrading', 'Petty trading', 'Petit commerce'), o('livestock', 'Livestock', 'Élevage'), o('craft', 'Craft', 'Artisanat'), o('none', 'None', 'Aucun')]),
  assets: list('assets', l('Assets', 'Biens'), [o('bicycle', 'Bicycle', 'Vélo'), o('radio', 'Radio', 'Radio'), o('mobilePhone', 'Mobile phone', 'Téléphone'), o('motorbike', 'Motorbike', 'Moto'), o('tricycle', 'Tricycle', 'Tricycle'), o('donkeyCart', 'Donkey cart', 'Charrette'), o('tractor', 'Tractor', 'Tracteur')]),
  water: list('water', l('Water sources', 'Sources d’eau'), [o('borehole', 'Borehole', 'Forage'), o('dam', 'Dam', 'Barrage'), o('river', 'River', 'Rivière'), o('well', 'Well', 'Puits'), o('pipe', 'Piped water', 'Eau courante')]),
  amenities: list('amenities', l('Amenities', 'Équipements'), [o('school', 'School', 'École'), o('clinic', 'Clinic', 'Centre de santé'), o('market', 'Market', 'Marché'), o('mosque', 'Mosque', 'Mosquée'), o('church', 'Church', 'Église'), o('electricity', 'Electricity', 'Électricité')]),
  causes: list('causes', l('Causes of death', 'Causes de mortalité'), [o('drought', 'Drought', 'Sécheresse'), o('fire', 'Bush fire', 'Feu de brousse'), o('termites', 'Termites', 'Termites'), o('grazing', 'Animal grazing', 'Pâturage'), o('cutting', 'Cut down', 'Abattu'), o('unknown', 'Unknown', 'Inconnue')]),
  pests: list('pests', l('Pests', 'Ravageurs'), [o('termites', 'Termites', 'Termites'), o('mistletoe', 'Mistletoe', 'Gui'), o('caterpillars', 'Caterpillars', 'Chenilles'), o('fungus', 'Fungus', 'Champignons'), o('none', 'None seen', 'Aucun')]),
  species: list('species', l('Tree species', 'Essences'), [o('shea', 'Shea', 'Karité'), o('dawadawa', 'Dawadawa', 'Néré'), o('mango', 'Mango', 'Manguier'), o('cashew', 'Cashew', 'Anacardier'), o('moringa', 'Moringa', 'Moringa')]),
};

const KAKAO_LISTS = {
  marital: list('marital', l('Marital status', 'Situation matrimoniale'), SHARED.marital.options.slice(0, 3)),
  education: list('education', l('Education levels', 'Niveaux d’études'), [o('none', 'None', 'Aucun'), o('primary', 'Primary', 'Primaire'), o('secondary', 'Secondary', 'Secondaire'), o('tertiary', 'Tertiary', 'Supérieur')]),
  languages: list('languages', l('Languages', 'Langues'), ['Bété', 'Baoulé', 'Dioula', 'Sénoufo', 'Malinké', 'Français'].map((x) => o(x, x, x))),
  idTypes: list('idTypes', l('ID types', 'Types de pièce'), [o('cni', 'National ID card', 'CNI'), o('carteProducteur', 'Producer card', 'Carte producteur'), o('none', 'None', 'Aucune')]),
  certifications: list('certifications', l('Certifications', 'Certifications'), [o('rainforestAlliance', 'Rainforest Alliance', 'Rainforest Alliance'), o('fairtrade', 'Fairtrade', 'Fairtrade'), o('none', 'None', 'Aucune')]),
  chemicals: list('chemicals', l('Farm chemicals', 'Produits phytosanitaires'), [o('herbicide', 'Herbicide', 'Herbicide'), o('insecticide', 'Insecticide', 'Insecticide'), o('fungicide', 'Fungicide', 'Fongicide'), o('fertiliser', 'Fertiliser', 'Engrais'), o('none', 'None', 'Aucun')]),
  water: SHARED.water,
};

type ListDef = { key: string; name: L; options: Option[] };
function listsFor(orgId: string): Record<string, ListDef> {
  if (orgId === ORG.vitara) return SHARED;
  if (orgId === ORG.kakao) return KAKAO_LISTS;
  return { marital: SHARED.marital, education: SHARED.education, crops: SHARED.crops };
}

export function optionListsFor(orgId: string, now: string): OptionList[] {
  return Object.values(listsFor(orgId)).map((x) => ({ id: listId(orgId, x.key), orgId, name: x.name, options: x.options, updatedAt: now }));
}

/** Questions that read their options from a shared list. */
const LINKS: Record<string, string> = {
  maritalStatus: 'marital', cropsPrimary: 'crops', cropsSecondary: 'crops', language: 'languages', educationLevel: 'education', incomePrimary: 'income',
  incomeSecondary: 'income', assets: 'assets', idType: 'idTypes', waterSource: 'water', amenities: 'amenities', causeOfDeath: 'causes', pests: 'pests',
  species: 'species', crop: 'crops', incomeSources: 'income', chemicals: 'chemicals',
};
function linkLists(orgId: string, qs: Question[]): Question[] {
  const lists = listsFor(orgId);
  return qs.map((x) => {
    const key = LINKS[x.id];
    const def = key ? lists[key] : undefined;
    return def ? { ...x, optionListId: listId(orgId, def.key), options: def.options } : x;
  });
}

// ---------------------------------------------------------------- Form definitions

const cond = (questionId: string, op: 'equals' | 'notEquals' | 'gt', value: unknown): LogicGroup => ({ combinator: 'AND', conditions: [{ questionId, op, value }] });
const sec = (id: string, title: L, questions: Question[], extra: Partial<FormSection> = {}): FormSection => ({ id, title, questions, ...extra });
/** Survey questions aren't written to a record. */
const s = (id: string, type: Question['type'], label: L, extra: Partial<Question> = {}): Question => ({ ...q(id, type, label, extra), mapsTo: extra.mapsTo });

interface Def { key: string; name: string; binding: FormBinding; sections: FormSection[]; history?: number[]; subject?: FormRecord['subject']; status?: FormRecord['status']; description?: string; assignment?: FormRecord['assignment']; schedule?: FormRecord['schedule']; test?: boolean }

function vitaraFarmerSections(orgId: string): FormSection[] {
  const qs = linkLists(orgId, VITARA_FARMER);
  const by = (ids: string[]) => qs.filter((x) => ids.includes(x.id));
  return [
    sec('household', l('Household', 'Ménage'), by(['maritalStatus', 'spouseName', 'spousePhone', 'numberOfChildren', 'householdSize', 'hasMobilePhone', 'language', 'educationLevel', 'readsWritesEnglish'])),
    sec('livelihood', l('Livelihood and land', 'Moyens de subsistance et terres'), by(['incomePrimary', 'incomeSecondary', 'cropsPrimary', 'cropsSecondary', 'landSize', 'landOwnership', 'hasFarmLandAccess', 'assets'])),
    sec('identity', l('Identity', 'Identité'), by(['idType', 'idNumber', 'altPhone'])),
    sec('children', l('Children', 'Enfants'), by(['children'])),
  ];
}

function defs(orgId: string, now: Date): Def[] {
  const due = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  if (orgId === ORG.vitara) {
    return [
      { key: 'farmer', name: 'Farmer profile', binding: 'farmerProfile', sections: vitaraFarmerSections(orgId), history: [10, 17] },
      { key: 'community', name: 'Community profile', binding: 'communityProfile', sections: [sec('profile', l('Community profile', 'Profil du village'), linkLists(orgId, COMMUNITY))], history: [7, 11] },
      { key: 'group', name: 'Farmer group profile', binding: 'groupProfile', sections: [sec('profile', l('Group profile', 'Profil du groupement'), GROUP)], history: [4] },
      {
        key: 'nursery', name: 'Nursery registration', binding: 'nurseryProfile', sections: [sec('nursery', l('Nursery', 'Pépinière'), linkLists(orgId, [
          q('nurseryName', 'shortText', l('Nursery name', 'Nom de la pépinière'), { required: true }),
          q('representative', 'shortText', l('Representative', 'Représentant'), { required: true }),
          q('representativePhone', 'phone', l('Representative phone', 'Téléphone du représentant')),
          q('capacity', 'number', l('Seedling capacity', 'Capacité en plants'), { validation: { min: 0, max: 100_000 } }),
          q('waterSource', 'selectOne', l('Water source', 'Source d’eau')),
          q('species', 'selectMany', l('Species raised', 'Essences produites')),
          q('location', 'gpsPoint', l('Location', 'Emplacement')),
          q('photos', 'image', l('Photos', 'Photos'), { media: { max: 3 } }),
          yes('agreementSigned', l('Agreement signed', 'Accord signé')),
          q('agreement', 'file', l('Agreement document', 'Document d’accord'), { showIf: cond('agreementSigned', 'equals', true) }),
        ]))],
      },
      {
        key: 'plot', name: 'Plot registration', binding: 'plotProfile', sections: [sec('plot', l('Plot', 'Parcelle'), linkLists(orgId, [
          q('boundary', 'gpsPolygon', l('Walk the boundary', 'Parcourir la limite'), { required: true }),
          q('areaHa', 'decimal', l('Area (ha)', 'Surface (ha)'), { validation: { min: 0, max: 200 } }),
          q('crop', 'selectOne', l('Main crop', 'Culture principale')),
          q('ownership', 'selectOne', l('Ownership', 'Propriété'), { options: [o('owned', 'Owned', 'Propriétaire'), o('family', 'Family land', 'Terre familiale'), o('rented', 'Rented', 'Location'), o('communal', 'Communal', 'Communautaire')] }),
          q('yearsCultivated', 'number', l('Years cultivated', 'Années de culture'), { validation: { min: 0, max: 80 } }),
          q('photo', 'image', l('Photo', 'Photo'), { media: { max: 2 } }),
        ]))],
      },
      {
        key: 'treemon', name: 'Tree monitoring visit (shea)', binding: 'treeMonitoring', assignment: { mode: 'agentTypes', ids: ['at_cons'], targetPerAgent: 50 }, sections: [sec('visit', l('Tree visit', 'Visite d’arbre'), linkLists(orgId, [
          q('treeCode', 'scanCode', l('Tree code', 'Code de l’arbre'), { required: true }),
          yes('alive', l('Tree is alive', 'L’arbre est vivant'), { required: true }),
          q('causeOfDeath', 'selectOne', l('Cause of death', 'Cause de mortalité'), { required: true, showIf: cond('alive', 'equals', false) }),
          q('heightM', 'decimal', l('Height (m)', 'Hauteur (m)'), { showIf: cond('alive', 'equals', true), validation: { min: 0, max: 30 } }),
          q('health', 'rating', l('Health', 'Santé'), { showIf: cond('alive', 'equals', true), scale: { max: 5, style: 'stars' } }),
          q('pests', 'selectMany', l('Pests seen', 'Ravageurs observés'), { showIf: cond('alive', 'equals', true) }),
          q('photo', 'image', l('Photo', 'Photo'), { required: true, media: { max: 2 } }),
          q('location', 'gpsPoint', l('Location', 'Emplacement')),
        ]))],
      },
      {
        key: 'nurserymon', name: 'Nursery monitoring round', binding: 'nurseryMonitoring', sections: [sec('round', l('Monitoring round', 'Tournée de suivi'), linkLists(orgId, [
          q('nurseryCode', 'scanCode', l('Nursery code', 'Code de la pépinière'), { required: true }),
          q('round', 'selectOne', l('Round', 'Tournée'), { options: [o('primary', 'Primary', 'Principale'), o('secondary', 'Secondary', 'Secondaire')], required: true }),
          q('visitDate', 'date', l('Visit date', 'Date de visite'), { required: true }),
          q('seedlingsAlive', 'number', l('Seedlings alive', 'Plants vivants'), { required: true, validation: { min: 0 } }),
          q('seedlingsDead', 'number', l('Seedlings dead', 'Plants morts'), { validation: { min: 0 } }),
          q('survivalPct', 'calculated', l('Survival (%)', 'Survie (%)'), { formula: 'seedlingsAlive * 100 / (seedlingsAlive + seedlingsDead)' }),
          q('pests', 'selectMany', l('Pests seen', 'Ravageurs observés')),
          yes('watered', l('Watered this week', 'Arrosé cette semaine')),
          q('shade', 'rating', l('Shade quality', 'Qualité de l’ombrage'), { scale: { max: 5, style: 'numbers' } }),
          q('notes', 'longText', l('Notes', 'Notes')),
        ]))],
      },
      workshopDef(),
      {
        key: 'recovery', name: 'Recovery feedback', binding: 'recoveryFeedback', sections: [sec('feedback', l('Feedback', 'Avis'), [
          q('satisfied', 'likert', l('How satisfied is the group with the recovery?', 'Le groupement est-il satisfait du recouvrement ?'), { scale: { max: 5, labels: [l('Very unhappy', 'Très insatisfait'), l('Unhappy', 'Insatisfait'), l('Neutral', 'Neutre'), l('Happy', 'Satisfait'), l('Very happy', 'Très satisfait')] } }),
          yes('fairWeighing', l('Weighing was fair', 'La pesée était juste')),
          yes('paidOnTime', l('Excess produce paid on time', 'Surplus payé à temps')),
          q('comments', 'longText', l('Comments', 'Commentaires')),
        ])],
      },
      {
        key: 'agentreport', name: 'Agent report', binding: 'agentReport', sections: [sec('report', l('Report', 'Rapport'), [
          q('category', 'selectOne', l('Issue', 'Problème'), { required: true, options: [o('absent', 'Absent from field', 'Absent du terrain'), o('cashShortage', 'Cash shortage', 'Manque de caisse'), o('lateSubmission', 'Late submission', 'Remise tardive'), o('misconduct', 'Misconduct', 'Mauvaise conduite'), o('other', 'Other', 'Autre')] }),
          q('date', 'date', l('Date', 'Date'), { required: true }),
          q('description', 'longText', l('What happened', 'Ce qui s’est passé'), { required: true, validation: { minLength: 10 } }),
          q('severity', 'selectOne', l('Severity', 'Gravité'), { options: [o('low', 'Low', 'Faible'), o('medium', 'Medium', 'Moyenne'), o('high', 'High', 'Élevée')] }),
          q('evidence', 'image', l('Evidence', 'Preuve'), { media: { max: 3 } }),
          yes('followUp', l('Needs follow-up', 'Suivi nécessaire')),
        ])],
      },
      {
        key: 'household', name: 'Household baseline survey 2026', binding: 'survey', subject: 'farmer', description: 'Baseline for the shea income programme: household, income, water and food.',
        assignment: { mode: 'agentTypes', ids: ['at_ceo'], targetPerAgent: 25, dueDate: due }, schedule: { start: new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10), end: due },
        sections: householdSurvey(orgId),
      },
      {
        key: 'sheaprocessing', name: 'Women’s shea processing survey', binding: 'survey', subject: 'farmerGroup', status: 'CLOSED', description: 'How women’s groups process shea; closed after the 2026 season.',
        assignment: { mode: 'agentTypes', ids: ['at_ceo'], targetPerAgent: 10 }, schedule: { start: new Date(now.getTime() - 200 * 86_400_000).toISOString().slice(0, 10), end: new Date(now.getTime() - 20 * 86_400_000).toISOString().slice(0, 10) },
        sections: [
          sec('start', l('Processing', 'Transformation'), [yes('processesShea', l('The group processes shea butter', 'Le groupement transforme le karité'), { required: true, jump: { when: cond('processesShea', 'equals', false), to: 'group' } })]),
          sec('processing', l('How the group processes', 'Méthode de transformation'), [
            s('kgPerWeek', 'decimal', l('Nuts processed per week (kg)', 'Noix transformées par semaine (kg)'), { validation: { min: 0, max: 5000 } }),
            s('method', 'selectOne', l('Method', 'Méthode'), { options: [o('traditional', 'Traditional', 'Traditionnelle'), o('improved', 'Improved stove', 'Foyer amélioré'), o('machine', 'Machine', 'Machine')], other: true }),
            s('equipment', 'selectMany', l('Equipment', 'Équipement'), { options: [o('mortar', 'Mortar', 'Mortier'), o('grinder', 'Grinder', 'Moulin'), o('roaster', 'Roaster', 'Torréfacteur'), o('press', 'Press', 'Presse')] }),
            s('output', 'table', l('Output by season', 'Production par saison'), { rows: [o('dry', 'Dry season', 'Saison sèche'), o('rainy', 'Rainy season', 'Saison des pluies')], columns: [o('nutsKg', 'Nuts (kg)', 'Noix (kg)'), o('butterKg', 'Butter (kg)', 'Beurre (kg)')] }),
            s('priceSatisfaction', 'likert', l('Satisfied with the butter price', 'Satisfaite du prix du beurre'), { scale: { max: 5, low: l('Not at all', 'Pas du tout'), high: l('Completely', 'Tout à fait') } }),
            yes('wantsTraining', l('Wants quality training', 'Souhaite une formation qualité')),
          ]),
          sec('group', l('The group', 'Le groupement'), [
            s('membersPresent', 'number', l('Members present', 'Membres présentes'), { validation: { min: 0, max: 200 } }),
            s('contact', 'contact', l('Contact person', 'Personne de contact')),
            s('comments', 'longText', l('Comments', 'Commentaires')),
            s('signature', 'signature', l('Leader’s signature', 'Signature de la responsable')),
          ]),
        ],
      },
    ];
  }
  if (orgId === ORG.kakao) {
    return [
      { key: 'farmer', name: 'Profil producteur', binding: 'farmerProfile', sections: [sec('profil', l('Farmer profile', 'Profil producteur'), linkLists(orgId, KAKAO_FARMER))], history: [6] },
      { key: 'community', name: 'Profil du village', binding: 'communityProfile', sections: [sec('profil', l('Village profile', 'Profil du village'), linkLists(orgId, COMMUNITY))] },
      { key: 'group', name: 'Profil de la section', binding: 'groupProfile', sections: [sec('profil', l('Group profile', 'Profil de la section'), GROUP)] },
      {
        key: 'plot', name: 'Enregistrement de parcelle', binding: 'plotProfile', sections: [sec('parcelle', l('Plot', 'Parcelle'), [
          q('boundary', 'gpsPolygon', l('Walk the boundary', 'Parcourir la limite'), { required: true }),
          q('areaHa', 'decimal', l('Area (ha)', 'Surface (ha)'), { validation: { min: 0, max: 100 } }),
          q('cocoaTrees', 'number', l('Cocoa trees', 'Cacaoyers'), { validation: { min: 0 } }),
          q('shadeTrees', 'number', l('Shade trees', 'Arbres d’ombrage'), { validation: { min: 0 } }),
          yes('forestBefore2020', l('Was forest after 31 Dec 2020', 'Était une forêt après le 31/12/2020'), { required: true }),
        ])],
      },
      workshopDef(),
      {
        key: 'rdue', name: 'Enquête RDUE ménage', binding: 'survey', subject: 'farmer', description: 'Enquête ménage pour la conformité RDUE et le travail des enfants.',
        assignment: { mode: 'all', ids: [], targetPerAgent: 20, dueDate: due }, schedule: { start: new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10), end: due },
        sections: [
          sec('consent', l('Consent', 'Consentement'), [s('intro', 'note', l('Read the consent text to the farmer before you start.', 'Lisez le texte de consentement au producteur avant de commencer.')), yes('consent', l('The farmer agrees to the survey', 'Le producteur accepte l’enquête'), { required: true, jump: { when: cond('consent', 'equals', false), to: 'END' } })]),
          sec('parcelles', l('Plots', 'Parcelles'), linkLists(orgId, [
            s('plots', 'number', l('Number of cocoa plots', 'Nombre de parcelles de cacao'), { required: true, validation: { min: 0, max: 20 } }),
            s('chemicals', 'selectMany', l('Farm chemicals used', 'Produits utilisés')),
            s('waterSource', 'selectOne', l('Drinking water source', 'Source d’eau potable')),
          ])),
          sec('enfants', l('Children', 'Enfants'), [
            yes('childrenWork', l('Children under 15 work on the farm', 'Des enfants de moins de 15 ans travaillent au champ'), { required: true }),
            s('childTasks', 'selectMany', l('Tasks done by children', 'Tâches réalisées par les enfants'), { showIf: cond('childrenWork', 'equals', true), options: [o('carrying', 'Carrying loads', 'Porter des charges'), o('spraying', 'Spraying', 'Pulvérisation'), o('machete', 'Using machetes', 'Utiliser la machette'), o('harvest', 'Harvest', 'Récolte')] }),
            yes('childrenSchool', l('All children attend school', 'Tous les enfants vont à l’école')),
          ]),
          sec('fin', l('End', 'Fin'), [s('gps', 'gpsPoint', l('Location', 'Emplacement')), s('photo', 'image', l('Photo of the household', 'Photo du ménage'), { media: { max: 1 } })]),
        ],
      },
      {
        key: 'satisfaction', name: 'Satisfaction des délégués', binding: 'survey', status: 'TEST', test: true, description: 'Pilote avec deux délégués avant diffusion.',
        assignment: { mode: 'all', ids: [] },
        sections: [sec('avis', l('Feedback', 'Avis'), [
          s('app', 'nps', l('Would you recommend the app to another délégué?', 'Recommanderiez-vous l’application à un autre délégué ?'), { required: true }),
          s('hardest', 'ranking', l('Rank what takes the most time', 'Classez ce qui prend le plus de temps'), { options: [o('sync', 'Sync', 'Synchronisation'), o('weighing', 'Weighing', 'Pesée'), o('payments', 'Payments', 'Paiements'), o('registration', 'Registration', 'Enregistrement')] }),
          s('comments', 'longText', l('Comments', 'Commentaires')),
        ])],
      },
    ];
  }
  return [
    { key: 'farmer', name: 'Farmer profile', binding: 'farmerProfile', sections: [sec('profile', l('Farmer profile', 'Profil producteur'), linkLists(orgId, GENERIC_FARMER))] },
    { key: 'community', name: 'Community profile', binding: 'communityProfile', sections: [sec('profile', l('Community profile', 'Profil du village'), COMMUNITY)] },
    { key: 'group', name: 'Farmer group profile', binding: 'groupProfile', sections: [sec('profile', l('Group profile', 'Profil du groupement'), GROUP)] },
    workshopDef(),
  ];
}

function workshopDef(): Def {
  return {
    key: 'workshop', name: 'Workshop feedback', binding: 'workshopFeedback', assignment: { mode: 'all', ids: [] }, sections: [sec('feedback', l('Feedback', 'Avis'), [
      q('overall', 'rating', l('Overall rating', 'Note globale'), { required: true, scale: { max: 5, style: 'stars' } }),
      q('useful', 'likert', l('The training was useful for my farm', 'La formation est utile pour mon exploitation'), { scale: { max: 5, low: l('Disagree', 'Pas d’accord'), high: l('Agree', 'D’accord') } }),
      q('recommend', 'nps', l('Would you recommend this training to a neighbour?', 'Recommanderiez-vous cette formation à un voisin ?')),
      q('learned', 'longText', l('What will you do differently?', 'Que ferez-vous autrement ?')),
      yes('applyPractice', l('Will apply the practice this season', 'Appliquera la pratique cette saison')),
    ])],
  };
}

function householdSurvey(orgId: string): FormSection[] {
  return [
    sec('consent', l('Consent', 'Consentement'), [
      s('intro', 'note', l('Read the consent text to the farmer. Stop if they do not agree.', 'Lisez le texte de consentement. Arrêtez si le producteur refuse.')),
      yes('consent', l('The farmer agrees to the survey', 'Le producteur accepte l’enquête'), { required: true, jump: { when: cond('consent', 'equals', false), to: 'END' } }),
    ]),
    sec('household', l('Household', 'Ménage'), [
      s('members', 'number', l('People in the household', 'Personnes dans le ménage'), { required: true, validation: { min: 1, max: 40 } }),
      s('childrenCount', 'number', l('Children under 18', 'Enfants de moins de 18 ans'), { validation: { min: 0, max: 30 } }),
      s('adults', 'calculated', l('Adults', 'Adultes'), { formula: 'members - childrenCount' }),
      s('head', 'selectOne', l('Head of household', 'Chef de ménage'), { options: [o('self', 'The farmer', 'Le producteur'), o('spouse', 'Spouse', 'Conjoint'), o('parent', 'Parent', 'Parent')], other: true }),
    ]),
    sec('income', l('Income', 'Revenus'), linkLists(orgId, [
      s('incomeSources', 'selectMany', l('Income sources', 'Sources de revenu'), { required: true }),
      s('monthlyIncome', 'currency', l('Income last month', 'Revenu du mois dernier'), { validation: { min: 0 } }),
      yes('saves', l('Saves money', 'Épargne')),
      s('savesWhere', 'selectOne', l('Where', 'Où'), { showIf: cond('saves', 'equals', true), requiredIf: cond('saves', 'equals', true), options: [o('vsla', 'VSLA', 'AVEC'), o('bank', 'Bank', 'Banque'), o('momo', 'Mobile money', 'Mobile money'), o('home', 'At home', 'À la maison')] }),
      s('sheaSatisfaction', 'likert', l('Satisfied with shea income', 'Satisfait des revenus du karité'), { scale: { max: 5, low: l('Not at all', 'Pas du tout'), high: l('Very', 'Très') } }),
    ])),
    sec('water', l('Water and food', 'Eau et alimentation'), linkLists(orgId, [
      s('waterSource', 'selectOne', l('Drinking water source', 'Source d’eau potable')),
      s('waterMinutes', 'number', l('Minutes to fetch water', 'Minutes pour aller chercher l’eau'), { validation: { min: 0, max: 300 } }),
      s('hungryMonths', 'number', l('Months with too little food last year', 'Mois de soudure l’an dernier'), { validation: { min: 0, max: 12 } }),
    ])),
    sec('end', l('Location and photo', 'Position et photo'), [s('gps', 'gpsPoint', l('Location', 'Emplacement')), s('photo', 'image', l('Photo of the household', 'Photo du ménage'), { media: { max: 1 } })]),
  ];
}

/** Older versions keep the first n questions (in form order) — profile forms grew over time. */
function truncate(sections: FormSection[], n: number): FormSection[] {
  let left = n;
  return sections.map((sx) => {
    const take = sx.questions.slice(0, Math.max(0, left));
    left -= take.length;
    return { ...sx, questions: take };
  }).filter((sx) => sx.questions.length);
}

/** The company's starting forms with their version history (PRD 12). */
export function seedForms(orgId: string, ownerId: string, now: Date): FormRecord[] {
  return defs(orgId, now).map((d, i) => {
    const id = formId(orgId, d.key);
    const steps = [...(d.history ?? []), Infinity];
    const created = new Date(now.getTime() - (400 - i * 7) * 86_400_000);
    const versions = d.test ? [] : steps.map((n, vi) => {
      const at = new Date(created.getTime() + vi * 90 * 86_400_000);
      const version = vi + 1;
      const schema: FormSchema = { id, orgId, name: d.name, binding: d.binding, version, status: 'LIVE', sections: n === Infinity ? d.sections : truncate(d.sections, n) };
      return { version, publishedAt: at.toISOString(), publishedBy: ownerId, schema, note: vi === 0 ? 'First version' : 'Added questions' };
    });
    const latest = versions[versions.length - 1];
    return {
      id, orgId, name: d.name, description: d.description, binding: d.binding, subject: d.subject, status: d.status ?? (d.test ? 'TEST' : 'LIVE'), ownerId,
      createdAt: created.toISOString(), updatedAt: (latest?.publishedAt ?? created.toISOString()),
      draft: { id, orgId, name: d.name, binding: d.binding, version: (latest?.version ?? 0) + 1, status: 'DRAFT', sections: d.sections },
      versions, assignment: d.assignment ?? { mode: 'all', ids: [] }, schedule: d.schedule ?? {}, testUserIds: [],
    };
  });
}
