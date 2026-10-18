import { getPath } from '@/lib/utils';

/** Template engine (PRD 8.11): `{{farmer.name}}`-style variables, per language, with branding. */
export interface MessageTemplate {
  id: string;
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'RECEIPT' | 'CONTRACT';
  eventKey: string;
  body: Partial<Record<'en' | 'fr', string>>;
  subject?: Partial<Record<'en' | 'fr', string>>;
}

export function renderTemplate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const v = getPath(vars, path);
    return v == null ? '' : String(v);
  });
}

export function templateVariables(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
}

export function renderMessage(t: MessageTemplate, lang: 'en' | 'fr', vars: Record<string, unknown>) {
  const body = t.body[lang] ?? t.body.en ?? '';
  const subject = t.subject ? (t.subject[lang] ?? t.subject.en ?? '') : undefined;
  return { subject: subject ? renderTemplate(subject, vars) : undefined, body: renderTemplate(body, vars) };
}
