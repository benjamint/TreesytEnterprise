import { formatInTimeZone } from 'date-fns-tz';
import { formatDistanceToNow } from 'date-fns';
import { enGB, fr } from 'date-fns/locale';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type { Lang } from '@/types';

const LOCALES = { en: enGB, fr };

/** All dates render in the company time zone (PRD 3). */
export function formatDate(iso: string | Date, timeZone: string, lang: Lang, pattern = 'd MMM yyyy'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, timeZone, pattern, { locale: LOCALES[lang] });
}

export function formatRelative(iso: string | Date, lang: Lang): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return formatDistanceToNow(d, { addSuffix: true, locale: LOCALES[lang] });
}

const numCache = new Map<string, Intl.NumberFormat>();
export function formatNumber(n: number, locale: string, opts: Intl.NumberFormatOptions = {}): string {
  const key = locale + JSON.stringify(opts);
  let f = numCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    numCache.set(key, f);
  }
  return f.format(n).replace(/[\u202f\u00a0]/g, ' ');
}

/** International phone display, validated by country (libphonenumber-js). */
export function formatPhone(e164: string, country?: string): string {
  const p = parsePhoneNumberFromString(e164, country as CountryCode | undefined);
  return p ? p.formatInternational() : e164;
}

export function isValidPhone(value: string, country: string): boolean {
  const p = parsePhoneNumberFromString(value, country as CountryCode);
  return !!p && p.isValid();
}
