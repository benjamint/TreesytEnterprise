import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowUpRight, Download, Lock, PowerOff, Sparkles } from 'lucide-react';
import type { AiAnswer } from '@/services/aiAssistant';
import type { CellKind } from '@/data/ai-intents';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Disclosure } from '@/components/shared/Disclosure';
import { HBars } from '@/components/charts/charts';
import { fromMinor } from '@/engines/money';
import { useCurrentOrg, useFormat, useT } from '@/stores/hooks';

const MONEY_PARAMS = new Set(['amount', 'total']);
const KG_PARAMS = new Set(['kg']);

export function useCellFormat() {
  const f = useFormat();
  const { t } = useT();
  return (kind: CellKind, v: string | number, key?: string): string => {
    if (kind === 'money') return f.money(Number(v));
    if (kind === 'kg') return f.kg(Number(v));
    if (kind === 'number') return f.number(Number(v));
    if (kind === 'pct') return `${f.number(Number(v), { maximumFractionDigits: 1 })}%`;
    if (kind === 'date') return f.date(String(v));
    if (key === 'docType') return t(`docType.${v}`);
    if (key === 'gender') return t(`gender.${v}`);
    if (key === 'risk') return t(`risk.${v}`);
    if (key === 'reconStatus') return t(`ai.recon.${v}`);
    if (key === 'flags') return String(v).split(', ').map((x) => t(`ai.flag.${x}`)).join(', ');
    return String(v);
  };
}

/** Params formatted for the answer sentence (money, kg and counts in the company's locale). */
export function useAnswerParams(answer: AiAnswer) {
  const f = useFormat();
  const { t } = useT();
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(answer.params ?? {})) {
      if (MONEY_PARAMS.has(k)) out[k] = f.money(Number(v));
      else if (KG_PARAMS.has(k)) out[k] = f.kg(Number(v));
      else if (k === 'period') out[k] = t(`ai.period.${v}`);
      else if (k === 'policy') out[k] = t(`set.buying.debtPolicy.${v}`);
      else if (typeof v === 'number') out[k] = f.number(v, { maximumFractionDigits: 1 });
      else out[k] = v;
    }
    // i18next plural selection needs a numeric count.
    return { ...out, count: Number(answer.params?.count ?? 0) } as Record<string, string | number>;
  }, [answer.params, f, t]);
}

/** One answer: sentence, chart, table, "Open in …" links, explanation and CSV export (PRD B2). */
export function AnswerCard({ answer, question, compact }: { answer: AiAnswer; question: string; compact?: boolean }) {
  const { t } = useT();
  const org = useCurrentOrg();
  const cell = useCellFormat();
  const params = useAnswerParams(answer);
  const [all, setAll] = useState(false);
  const table = answer.table;
  const rows = table ? (all ? table.rows : table.rows.slice(0, compact ? 5 : 8)) : [];

  const exportCsv = () => {
    if (!table) return;
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [table.columns.map((c) => esc(t(`ai.col.${c.key}`))).join(','), ...table.rows.map((r) => table.columns.map((c) => esc(cell(c.kind === 'money' || c.kind === 'kg' ? 'number' : c.kind, c.kind === 'money' ? fromMinor(Number(r[c.key]), org.currency) : r[c.key]!, c.key))).join(','))];
    const url = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${org.code.toLowerCase()}-${answer.intent}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let sentence: string;
  let Icon = Sparkles;
  if (answer.status === 'module') {
    sentence = t('common.moduleOff', { module: t(`module.${answer.module}`), company: org.name });
    Icon = PowerOff;
  } else if (answer.status === 'permission') {
    sentence = t('ai.noPermission', { permission: answer.permission });
    Icon = Lock;
  } else if (answer.status === 'llm') sentence = answer.text ?? '';
  else if (answer.status === 'error') sentence = t('ai.error');
  else if (answer.status === 'unknown') sentence = t('ai.unknown');
  else if (answer.status === 'empty') sentence = t(`ai.empty.${answer.intent}`, params);
  else sentence = t(`ai.answer.${answer.intent}`, params);

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface shadow-soft" aria-label={question}>
      <div className="h-1 bg-gradient-to-r from-[#14583F] to-[#B8E05A]" aria-hidden="true" />
      <div className="space-y-5 p-5">
        <p className="flex items-start gap-3 text-[16px] leading-relaxed text-ink">
          <Icon className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span>{sentence}</span>
        </p>

        {answer.status === 'ok' && answer.chart && table && (
          <HBars data={table.rows.slice(0, 8).map((r) => ({ label: String(r[answer.chart!.label]), value: Number(r[answer.chart!.value]) }))} format={(v) => cell(answer.chart!.kind, v)} />
        )}

        {answer.status === 'ok' && table && !compact && (
          <div className="overflow-x-auto rounded-ctl border border-line">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead className="bg-canvas">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.key} className={`whitespace-nowrap px-3 py-2 text-[12px] font-semibold text-label ${['money', 'kg', 'number', 'pct'].includes(c.kind) ? 'text-right' : 'text-left'}`}>{t(`ai.col.${c.key}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {table.columns.map((c) => (
                      <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 ${['money', 'kg', 'number', 'pct'].includes(c.kind) ? 'tnum text-right text-ink' : c.kind === 'code' ? 'font-mono text-ink' : 'text-body'}`}>
                        {c.key === 'status' ? <StatusBadge status={String(r[c.key])} /> : cell(c.kind, r[c.key]!, c.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.rows.length > rows.length && (
              <button type="button" onClick={() => setAll(true)} className="w-full border-t border-line py-2 text-[13px] font-medium text-brand hover:bg-brand-soft/40">
                {t('ai.showAll', { count: table.rows.length })}
              </button>
            )}
          </div>
        )}

        {(answer.links?.length || table) && (
          <div className="flex flex-wrap items-center gap-2">
            {answer.links?.map((l) => (
              <Button key={l.to} variant="secondary" size="sm" asChild>
                <NavLink to={l.to}>{t('ai.openIn', { page: t(`nav.${l.key}`) })} <ArrowUpRight /></NavLink>
              </Button>
            ))}
            {answer.status === 'ok' && table && !compact && (
              <Button variant="ghost" size="sm" onClick={exportCsv}><Download /> {t('common.export')}</Button>
            )}
          </div>
        )}

        {(answer.status === 'ok' || answer.status === 'empty') && !compact && (
          <Disclosure title={t('ai.explainTitle')} className="border-t border-line">
            <p className="text-[14px] text-body">{t(`ai.explain.${answer.intent}`, params)}</p>
          </Disclosure>
        )}
      </div>
    </article>
  );
}
