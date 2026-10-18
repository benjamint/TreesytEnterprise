import type { PaymentProvider } from '@/types';

/** Payment providers available per country (Settings → Payments). */
export const PROVIDER_CATALOG: PaymentProvider[] = [
  { id: 'mtn_gh', name: 'MTN MoMo', country: 'GH', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Vitara MoMo collections', prefixes: ['024', '054', '055', '059', '025', '053'] },
  { id: 'telecel_gh', name: 'Telecel Cash', country: 'GH', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Telecel Cash wallet', prefixes: ['020', '050'] },
  { id: 'airteltigo_gh', name: 'AirtelTigo Money', country: 'GH', kind: 'MOBILE_MONEY', enabled: true, walletName: 'AT Money wallet', prefixes: ['026', '027', '056', '057'] },
  { id: 'bank_gh', name: 'Bank transfer', country: 'GH', kind: 'BANK', enabled: true, walletName: 'Operating account', prefixes: [] },
  { id: 'orange_ci', name: 'Orange Money', country: 'CI', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Compte Orange Money', prefixes: ['07'] },
  { id: 'wave_ci', name: 'Wave', country: 'CI', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Compte Wave', prefixes: ['01'] },
  { id: 'mtn_ci', name: 'MTN MoMo CI', country: 'CI', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Compte MTN MoMo', prefixes: ['05'] },
  { id: 'bank_ci', name: 'Virement bancaire', country: 'CI', kind: 'BANK', enabled: true, walletName: 'Compte courant', prefixes: [] },
  { id: 'mpesa_ke', name: 'M-Pesa', country: 'KE', kind: 'MOBILE_MONEY', enabled: true, walletName: 'M-Pesa paybill', prefixes: ['07', '01'] },
  { id: 'wave_sn', name: 'Wave', country: 'SN', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Wave', prefixes: ['77', '78'] },
  { id: 'orange_sn', name: 'Orange Money', country: 'SN', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Orange Money', prefixes: ['77'] },
  { id: 'orange_bf', name: 'Orange Money', country: 'BF', kind: 'MOBILE_MONEY', enabled: true, walletName: 'Orange Money', prefixes: ['07'] },
  { id: 'bank_eu', name: 'SEPA transfer', country: 'SE', kind: 'BANK', enabled: true, walletName: 'Bank account', prefixes: [] },
  { id: 'bank_ng', name: 'Bank transfer', country: 'NG', kind: 'BANK', enabled: true, walletName: 'Bank account', prefixes: [] },
  { id: 'bank_ke', name: 'Bank transfer', country: 'KE', kind: 'BANK', enabled: true, walletName: 'Bank account', prefixes: [] },
  { id: 'cash', name: 'Cash with proof', country: '*', kind: 'CASH', enabled: true, walletName: 'Cash', prefixes: [] },
];

/** Detect the network from a wallet number (PRD E1 "network auto-detected"). */
export function detectProvider(number: string, providers: PaymentProvider[]): PaymentProvider | undefined {
  const local = number.replace(/\s+/g, '').replace(/^\+\d{3}/, '0');
  return providers.filter((p) => p.kind === 'MOBILE_MONEY').find((p) => p.prefixes.some((pre) => local.startsWith(pre) || local.startsWith(pre.replace(/^0/, ''))));
}
