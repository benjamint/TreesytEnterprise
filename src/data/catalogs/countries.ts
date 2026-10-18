import type { Country, Currency } from '@/types';

/** Global countries catalogue (Platform → Global catalogues). */
export const COUNTRIES: Country[] = [
  { code: 'GH', name: { en: 'Ghana', fr: 'Ghana' }, currency: 'GHS', dialCode: '+233', defaultLanguage: 'en', timezone: 'Africa/Accra',
    locationLevels: [{ en: 'Region', fr: 'Région' }, { en: 'District', fr: 'District' }, { en: 'Community', fr: 'Communauté' }],
    paymentProviders: ['mtn_gh', 'telecel_gh', 'airteltigo_gh', 'bank_gh', 'cash'], smsProviders: ['Hubtel', 'mNotify'] },
  { code: 'CI', name: { en: "Côte d'Ivoire", fr: "Côte d'Ivoire" }, currency: 'XOF', dialCode: '+225', defaultLanguage: 'fr', timezone: 'Africa/Abidjan',
    locationLevels: [{ en: 'District', fr: 'District' }, { en: 'Region', fr: 'Région' }, { en: 'Department', fr: 'Département' }, { en: 'Village', fr: 'Village' }],
    paymentProviders: ['orange_ci', 'wave_ci', 'mtn_ci', 'bank_ci', 'cash'], smsProviders: ['Orange SMS API', 'Infobip'] },
  { code: 'SE', name: { en: 'Sweden', fr: 'Suède' }, currency: 'SEK', dialCode: '+46', defaultLanguage: 'en', timezone: 'Europe/Stockholm',
    locationLevels: [{ en: 'County', fr: 'Comté' }, { en: 'Municipality', fr: 'Municipalité' }], paymentProviders: ['bank_eu'], smsProviders: ['Infobip'] },
  { code: 'NG', name: { en: 'Nigeria', fr: 'Nigéria' }, currency: 'NGN', dialCode: '+234', defaultLanguage: 'en', timezone: 'Africa/Lagos',
    locationLevels: [{ en: 'State', fr: 'État' }, { en: 'LGA', fr: 'Zone de gouvernement local' }, { en: 'Community', fr: 'Communauté' }], paymentProviders: ['bank_ng', 'cash'], smsProviders: ['Termii'] },
  { code: 'KE', name: { en: 'Kenya', fr: 'Kenya' }, currency: 'KES', dialCode: '+254', defaultLanguage: 'en', timezone: 'Africa/Nairobi',
    locationLevels: [{ en: 'County', fr: 'Comté' }, { en: 'Sub-county', fr: 'Sous-comté' }, { en: 'Ward', fr: 'Quartier' }, { en: 'Village', fr: 'Village' }], paymentProviders: ['mpesa_ke', 'bank_ke', 'cash'], smsProviders: ["Africa's Talking"] },
  { code: 'BF', name: { en: 'Burkina Faso', fr: 'Burkina Faso' }, currency: 'XOF', dialCode: '+226', defaultLanguage: 'fr', timezone: 'Africa/Ouagadougou',
    locationLevels: [{ en: 'Region', fr: 'Région' }, { en: 'Province', fr: 'Province' }, { en: 'Village', fr: 'Village' }], paymentProviders: ['orange_bf', 'cash'], smsProviders: ['Orange SMS API'] },
  { code: 'TG', name: { en: 'Togo', fr: 'Togo' }, currency: 'XOF', dialCode: '+228', defaultLanguage: 'fr', timezone: 'Africa/Lome',
    locationLevels: [{ en: 'Region', fr: 'Région' }, { en: 'Prefecture', fr: 'Préfecture' }, { en: 'Village', fr: 'Village' }], paymentProviders: ['cash'], smsProviders: ['Infobip'] },
  { code: 'SN', name: { en: 'Senegal', fr: 'Sénégal' }, currency: 'XOF', dialCode: '+221', defaultLanguage: 'fr', timezone: 'Africa/Dakar',
    locationLevels: [{ en: 'Region', fr: 'Région' }, { en: 'Department', fr: 'Département' }, { en: 'Village', fr: 'Village' }], paymentProviders: ['wave_sn', 'orange_sn', 'cash'], smsProviders: ['Orange SMS API'] },
  { code: 'UG', name: { en: 'Uganda', fr: 'Ouganda' }, currency: 'UGX', dialCode: '+256', defaultLanguage: 'en', timezone: 'Africa/Kampala',
    locationLevels: [{ en: 'District', fr: 'District' }, { en: 'Sub-county', fr: 'Sous-comté' }, { en: 'Village', fr: 'Village' }], paymentProviders: ['cash'], smsProviders: ["Africa's Talking"] },
  { code: 'ET', name: { en: 'Ethiopia', fr: 'Éthiopie' }, currency: 'ETB', dialCode: '+251', defaultLanguage: 'en', timezone: 'Africa/Addis_Ababa',
    locationLevels: [{ en: 'Region', fr: 'Région' }, { en: 'Zone', fr: 'Zone' }, { en: 'Kebele', fr: 'Kebele' }], paymentProviders: ['cash'], smsProviders: ['Infobip'] },
];

export const CURRENCIES: Currency[] = [
  { code: 'GHS', minorUnits: 2, name: 'Ghana cedi' },
  { code: 'XOF', minorUnits: 0, name: 'West African CFA franc' },
  { code: 'USD', minorUnits: 2, name: 'US dollar' },
  { code: 'EUR', minorUnits: 2, name: 'Euro' },
  { code: 'KES', minorUnits: 2, name: 'Kenyan shilling' },
  { code: 'NGN', minorUnits: 2, name: 'Nigerian naira' },
  { code: 'SEK', minorUnits: 2, name: 'Swedish krona' },
  { code: 'UGX', minorUnits: 0, name: 'Ugandan shilling' },
  { code: 'ETB', minorUnits: 2, name: 'Ethiopian birr' },
];

export const GLOBAL_COMMODITIES = ['Shea nuts', 'Cocoa', 'Cashew', 'Coffee', 'Soybeans', 'Maize', 'Groundnuts', 'Sesame', 'Cowpea', 'Millet', 'Rubber', 'Palm oil', 'Rice', 'Sorghum'];
