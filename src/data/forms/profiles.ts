import type { FormSchema, Question } from '@/engines/forms';
import { ORG } from '@/data/seed/templates';

/**
 * Profile forms per company template (PRD C2–C4). Phase 6 moves these into the forms builder;
 * until then they are the published v1/v3 forms. Answers live in `customFields`.
 */

export type L = Partial<Record<'en' | 'fr', string>>;
export const l = (en: string, fr: string): L => ({ en, fr });
export const opt = (value: string, en: string, fr: string) => ({ value, label: l(en, fr) });
export const q = (id: string, type: Question['type'], label: L, extra: Partial<Question> = {}): Question => ({ id, type, label, mapsTo: `customFields.${id}`, ...extra });
export const yes = (id: string, label: L, extra: Partial<Question> = {}) => q(id, 'yesNo', label, extra);

const MARITAL = [opt('married', 'Married', 'Marié(e)'), opt('single', 'Single', 'Célibataire'), opt('widowed', 'Widowed', 'Veuf/veuve'), opt('divorced', 'Divorced', 'Divorcé(e)')];
const married = { combinator: 'AND' as const, conditions: [{ questionId: 'maritalStatus', op: 'equals' as const, value: 'married' }] };
const hasId = { combinator: 'AND' as const, conditions: [{ questionId: 'idType', op: 'notEquals' as const, value: 'none' }] };

export const VITARA_FARMER: Question[] = [
  q('maritalStatus', 'selectOne', l('Marital status', 'Situation matrimoniale'), { options: MARITAL }),
  q('spouseName', 'shortText', l('Spouse name', 'Nom du conjoint'), { showIf: married }),
  q('spousePhone', 'phone', l('Spouse phone', 'Téléphone du conjoint'), { showIf: married }),
  q('numberOfChildren', 'number', l('Number of children', 'Nombre d’enfants'), { validation: { min: 0, max: 30 } }),
  q('householdSize', 'number', l('Household size', 'Taille du ménage'), { required: true, validation: { min: 1, max: 40 } }),
  yes('hasMobilePhone', l('Has a mobile phone', 'A un téléphone portable')),
  q('incomePrimary', 'selectOne', l('Primary income', 'Revenu principal'), { options: [opt('farming', 'Farming', 'Agriculture'), opt('sheaPicking', 'Shea picking', 'Ramassage de karité'), opt('trading', 'Trading', 'Commerce'), opt('livestock', 'Livestock', 'Élevage')] }),
  q('incomeSecondary', 'selectOne', l('Secondary income', 'Revenu secondaire'), { options: [opt('sheaButterProcessing', 'Shea butter processing', 'Transformation du beurre de karité'), opt('pettyTrading', 'Petty trading', 'Petit commerce'), opt('craft', 'Craft', 'Artisanat'), opt('none', 'None', 'Aucun')] }),
  q('cropsPrimary', 'selectOne', l('Primary crop', 'Culture principale'), { options: [opt('shea', 'Shea', 'Karité'), opt('maize', 'Maize', 'Maïs'), opt('soybeans', 'Soybeans', 'Soja'), opt('groundnuts', 'Groundnuts', 'Arachides')] }),
  q('cropsSecondary', 'selectOne', l('Secondary crop', 'Culture secondaire'), { options: [opt('millet', 'Millet', 'Mil'), opt('sorghum', 'Sorghum', 'Sorgho'), opt('cowpea', 'Cowpea', 'Niébé'), opt('yam', 'Yam', 'Igname')] }),
  q('language', 'selectOne', l('Language', 'Langue'), { options: ['Waale', 'Dagaare', 'Dagbani', 'Sisaali', 'Gonja', 'Mampruli', 'Twi', 'Ewe'].map((x) => opt(x, x, x)) }),
  q('educationLevel', 'selectOne', l('Education level', 'Niveau d’études'), { options: [opt('none', 'None', 'Aucun'), opt('primary', 'Primary', 'Primaire'), opt('jhs', 'Junior high', 'Collège'), opt('shs', 'Senior high', 'Lycée'), opt('tertiary', 'Tertiary', 'Supérieur')] }),
  yes('readsWritesEnglish', l('Reads and writes English', 'Lit et écrit l’anglais')),
  q('landSize', 'decimal', l('Land size (acres)', 'Superficie (acres)'), { validation: { min: 0, max: 500 } }),
  q('landOwnership', 'selectOne', l('Land ownership', 'Propriété foncière'), { options: [opt('owned', 'Owned', 'Propriétaire'), opt('family', 'Family land', 'Terre familiale'), opt('rented', 'Rented', 'Location'), opt('communal', 'Communal', 'Communautaire')] }),
  yes('hasFarmLandAccess', l('Has access to farm land', 'A accès à une terre agricole')),
  q('assets', 'selectMany', l('Assets in the household', 'Biens du ménage'), { options: [opt('bicycle', 'Bicycle', 'Vélo'), opt('radio', 'Radio', 'Radio'), opt('mobilePhone', 'Mobile phone', 'Téléphone'), opt('motorbike', 'Motorbike', 'Moto'), opt('tricycle', 'Tricycle', 'Tricycle'), opt('donkeyCart', 'Donkey cart', 'Charrette'), opt('tractor', 'Tractor', 'Tracteur')] }),
  q('idType', 'selectOne', l('ID type', 'Type de pièce'), { options: [opt('ghanaCard', 'Ghana Card', 'Carte Ghana'), opt('votersId', 'Voter’s ID', 'Carte d’électeur'), opt('nhis', 'NHIS card', 'Carte NHIS'), opt('none', 'None', 'Aucune')] }),
  q('idNumber', 'shortText', l('ID number', 'Numéro de pièce'), { showIf: hasId }),
  q('altPhone', 'phone', l('Alternative phone', 'Autre téléphone')),
  q('children', 'repeatGroup', l('Children', 'Enfants'), {
    mapsTo: 'customFields.children',
    children: [
      { id: 'name', type: 'shortText', label: l('Name', 'Nom') },
      { id: 'age', type: 'number', label: l('Age', 'Âge'), validation: { min: 0, max: 60 } },
      { id: 'education', type: 'selectOne', label: l('Education', 'Études'), options: [opt('none', 'None', 'Aucun'), opt('primary', 'Primary', 'Primaire'), opt('jhs', 'Junior high', 'Collège'), opt('shs', 'Senior high', 'Lycée')] },
    ],
  }),
];

export const KAKAO_FARMER: Question[] = [
  q('maritalStatus', 'selectOne', l('Marital status', 'Situation matrimoniale'), { options: MARITAL.slice(0, 3) }),
  q('numberOfChildren', 'number', l('Number of children', 'Nombre d’enfants'), { validation: { min: 0, max: 30 } }),
  q('householdSize', 'number', l('Household size', 'Taille du ménage'), { required: true, validation: { min: 1, max: 40 } }),
  q('language', 'selectOne', l('Language', 'Langue'), { options: ['Bété', 'Baoulé', 'Dioula', 'Sénoufo', 'Malinké', 'Français'].map((x) => opt(x, x, x)) }),
  q('educationLevel', 'selectOne', l('Education level', 'Niveau d’études'), { options: [opt('none', 'None', 'Aucun'), opt('primary', 'Primary', 'Primaire'), opt('secondary', 'Secondary', 'Secondaire'), opt('tertiary', 'Tertiary', 'Supérieur')] }),
  q('cocoaHectares', 'decimal', l('Cocoa area (ha)', 'Surface cacao (ha)'), { validation: { min: 0, max: 200 } }),
  q('landOwnership', 'selectOne', l('Land ownership', 'Propriété foncière'), { options: [opt('owned', 'Owned', 'Propriétaire'), opt('family', 'Family land', 'Terre familiale'), opt('sharecropping', 'Sharecropping', 'Métayage')] }),
  q('idType', 'selectOne', l('ID type', 'Type de pièce'), { options: [opt('cni', 'National ID card', 'CNI'), opt('carteProducteur', 'Producer card', 'Carte producteur'), opt('none', 'None', 'Aucune')] }),
  q('idNumber', 'shortText', l('ID number', 'Numéro de pièce'), { showIf: hasId }),
];

export const GENERIC_FARMER: Question[] = [VITARA_FARMER[0]!, VITARA_FARMER[3]!, VITARA_FARMER[4]!, VITARA_FARMER[11]!, VITARA_FARMER[13]!, q('idNumber', 'shortText', l('ID number', 'Numéro de pièce'))];

export const COMMUNITY: Question[] = [
  yes('organisedGroups', l('Has organised groups', 'A des groupements organisés')),
  q('groupsCount', 'number', l('Number of groups', 'Nombre de groupements'), { showIf: { combinator: 'AND', conditions: [{ questionId: 'organisedGroups', op: 'equals', value: true }] }, validation: { min: 0, max: 50 } }),
  yes('vslaAvailable', l('VSLA available', 'AVEC disponible')),
  yes('groupLeaders', l('Group leaders identified', 'Responsables identifiés')),
  yes('membershipList', l('Membership list', 'Liste des membres')),
  yes('meetingRecords', l('Meeting records', 'Comptes rendus de réunion')),
  yes('contributionRecords', l('Contribution records', 'Registres de cotisations')),
  yes('paymentRecords', l('Payment records', 'Registres de paiements')),
  yes('partnershipAgreement', l('Partnership agreement signed', 'Accord de partenariat signé')),
  yes('reliableWater', l('Reliable water', 'Eau fiable')),
  q('waterSource', 'selectOne', l('Water source', 'Source d’eau'), { options: [opt('borehole', 'Borehole', 'Forage'), opt('dam', 'Dam', 'Barrage'), opt('river', 'River', 'Rivière'), opt('well', 'Well', 'Puits')] }),
  q('amenities', 'selectMany', l('Amenities', 'Équipements'), { options: [opt('school', 'School', 'École'), opt('clinic', 'Clinic', 'Centre de santé'), opt('market', 'Market', 'Marché'), opt('mosque', 'Mosque', 'Mosquée'), opt('church', 'Church', 'Église'), opt('electricity', 'Electricity', 'Électricité')] }),
  yes('landForNursery', l('Land for a nursery', 'Terrain pour une pépinière')),
  yes('landForTreePlanting', l('Land for tree planting', 'Terrain pour planter des arbres')),
];

export const GROUP: Question[] = [
  q('composition', 'selectOne', l('Membership composition', 'Composition'), { options: [opt('women', 'Women only', 'Femmes uniquement'), opt('men', 'Men only', 'Hommes uniquement'), opt('mixed', 'Mixed', 'Mixte')] }),
  yes('organisedLeadership', l('Has organised leadership', 'A une direction organisée')),
  yes('previousLoan', l('Took a previous loan', 'A déjà pris un prêt')),
  q('averageProduction', 'decimal', l('Average production per year', 'Production moyenne par an'), { validation: { min: 0 } }),
  q('productionCommodity', 'shortText', l('Production commodity', 'Produit')),
  q('productionUnit', 'selectOne', l('Production unit', 'Unité'), { options: [opt('kg', 'kg', 'kg'), opt('bag', 'Bags', 'Sacs'), opt('t', 'Tonnes', 'Tonnes')] }),
];

const schema = (orgId: string, id: string, name: string, binding: FormSchema['binding'], version: number, questions: Question[]): FormSchema => ({
  id, orgId, name, binding, version, status: 'LIVE', sections: [{ id: 's1', title: { en: name, fr: name }, questions }],
});

export function farmerProfileForm(orgId: string): FormSchema {
  if (orgId === ORG.vitara) return schema(orgId, 'vit_frm_farmer', 'Farmer profile', 'farmerProfile', 3, VITARA_FARMER);
  if (orgId === ORG.kakao) return schema(orgId, 'ki_frm_farmer', 'Profil producteur', 'farmerProfile', 2, KAKAO_FARMER);
  return schema(orgId, `${orgId}_frm_farmer`, 'Farmer profile', 'farmerProfile', 1, GENERIC_FARMER);
}

export function communityProfileForm(orgId: string): FormSchema {
  return schema(orgId, `${orgId}_frm_community`, 'Community profile', 'communityProfile', orgId === ORG.vitara ? 3 : 1, COMMUNITY);
}

export function groupProfileForm(orgId: string): FormSchema {
  return schema(orgId, `${orgId}_frm_group`, 'Farmer group profile', 'groupProfile', orgId === ORG.vitara ? 2 : 1, GROUP);
}
