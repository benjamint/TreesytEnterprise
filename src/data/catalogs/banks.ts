/** Banks offered for supplier bank payouts, per country (PRD D4). */
export const BANKS: Record<string, string[]> = {
  GH: ['GCB Bank', 'Ecobank Ghana', 'Absa Bank Ghana', 'Stanbic Bank Ghana', 'Fidelity Bank Ghana', 'CalBank', 'Agricultural Development Bank', 'Zenith Bank Ghana', 'Access Bank Ghana', 'Republic Bank Ghana'],
  CI: ['SGBCI', 'Société Ivoirienne de Banque', 'Ecobank Côte d’Ivoire', 'BICICI', 'NSIA Banque', 'Banque Atlantique', 'Coris Bank International', 'Orabank Côte d’Ivoire'],
  KE: ['KCB Bank', 'Equity Bank', 'Co-operative Bank of Kenya'],
  NG: ['Access Bank', 'Zenith Bank', 'First Bank of Nigeria'],
};
export const banksFor = (countries: string[]) => [...new Set(countries.flatMap((c) => BANKS[c] ?? []))];
