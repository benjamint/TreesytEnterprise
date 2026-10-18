import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';
import { DEFAULT_TERMS, termVariables } from '@/engines/terminology';

/** i18next with EN/FR. Company terminology is injected as `{{term.*}}` default variables (PRD 8.10). */
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false, defaultVariables: termVariables(DEFAULT_TERMS.en) },
  returnNull: false,
});

export default i18n;
