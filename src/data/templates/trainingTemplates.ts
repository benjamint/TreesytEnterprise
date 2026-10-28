import type { TopicAudience, TopicCategory } from '@/types';

/** Starter training topics by sector, offered on the catalogue page (PRD G3). */
export interface TopicTemplate { en: string; fr: string; category: TopicCategory; durationMin: number; audience: TopicAudience; materials: string[] }
const T = (en: string, fr: string, category: TopicCategory, durationMin: number, materials: string[] = [], audience: TopicAudience = 'FARMERS'): TopicTemplate => ({ en, fr, category, durationMin, audience, materials });

export const TOPIC_TEMPLATES: Record<string, TopicTemplate[]> = {
  shea: [
    T('Shea parkland management', 'Gestion des parcs à karité', 'CONSERVATION', 120, ['Parkland poster']),
    T('Good collection and drying of shea nuts', 'Bonne collecte et séchage des noix de karité', 'QUALITY', 90, ['Drying mat demo']),
    T('Bushfire prevention and control', 'Prévention et lutte contre les feux de brousse', 'CONSERVATION', 90, ['Fire-belt guide']),
    T('Grafting shea trees', 'Greffage du karité', 'AGRONOMY', 180, ['Grafting knives', 'Budding tape']),
    T('Safe storage and moisture control', 'Stockage et contrôle de l’humidité', 'QUALITY', 60, ['Moisture meter']),
  ],
  cocoa: [
    T('Pruning cocoa trees', 'Taille du cacaoyer', 'AGRONOMY', 120, ['Pruning saw']),
    T('Fermentation and drying', 'Fermentation et séchage', 'QUALITY', 90, ['Fermentation box plan']),
    T('Shade trees and agroforestry', 'Arbres d’ombrage et agroforesterie', 'CONSERVATION', 120, ['Species chart']),
    T('Swollen shoot: spot and report', 'Swollen shoot : repérer et signaler', 'AGRONOMY', 90, ['Photo cards']),
    T('Child labour awareness', 'Sensibilisation au travail des enfants', 'SOCIAL', 60, ['Community leaflet']),
  ],
  coffee: [
    T('Coffee pruning and stumping', 'Taille et recépage du caféier', 'AGRONOMY', 120),
    T('Cherry picking and sorting', 'Cueillette et tri des cerises', 'QUALITY', 90),
    T('Wet processing hygiene', 'Hygiène de la voie humide', 'QUALITY', 90),
    T('Soil and water conservation', 'Conservation des sols et de l’eau', 'CONSERVATION', 90),
  ],
  cashew: [
    T('Cashew orchard maintenance', 'Entretien des vergers d’anacardiers', 'AGRONOMY', 120),
    T('Nut drying and grading', 'Séchage et calibrage des noix', 'QUALITY', 90),
    T('Firebreaks around orchards', 'Pare-feux autour des vergers', 'CONSERVATION', 60),
    T('Group savings for inputs', 'Épargne de groupe pour les intrants', 'FINANCE', 90),
  ],
  grains: [
    T('Post-harvest losses in maize', 'Pertes après récolte du maïs', 'QUALITY', 90, ['Hermetic bag sample']),
    T('Aflatoxin awareness', 'Sensibilisation aux aflatoxines', 'SAFETY', 60),
    T('Safe use of farm chemicals', 'Utilisation sûre des produits chimiques', 'SAFETY', 90, ['PPE kit']),
    T('Farm record keeping', 'Tenue des registres de l’exploitation', 'FINANCE', 60, ['Record book']),
  ],
};
