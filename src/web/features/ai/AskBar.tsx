import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useCan, useModules, useT } from '@/stores/hooks';
import { useSuggestions } from './AiPage';

/** "Ask your operations" bar with four suggested questions (PRD B1.1). */
export function AskBar() {
  const { t } = useT();
  const navigate = useNavigate();
  const can = useCan();
  const modules = useModules();
  const chips = useSuggestions(true);
  const [q, setQ] = useState('');
  if (!modules.ai || !can('ai.view')) return null;
  const go = (question: string) => navigate(`/app/ai?q=${encodeURIComponent(question)}`);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) go(q.trim());
  };
  return (
    <section className="mb-6 rounded-card bg-gradient-to-r from-brand/60 via-brand/25 to-[#B8E05A] p-px shadow-soft" aria-label={t('nav.ai')} data-tour="ask-bar">
      <div className="rounded-[calc(var(--r-card)-1px)] bg-surface px-4 py-3 sm:px-5 sm:py-4">
        <form onSubmit={submit} className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')} className="h-ctl min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
          <button type="submit" disabled={!q.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-on-brand shadow-inner transition-opacity disabled:opacity-30" aria-label={t('ai.send')}>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={() => go(t(`ai.q.${c.key}`))} className="h-7 rounded-full border border-line bg-subtle px-2.5 text-[12px] text-body transition-colors hover:border-line-strong hover:bg-surface hover:text-ink">
                {t(`ai.q.${c.key}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
