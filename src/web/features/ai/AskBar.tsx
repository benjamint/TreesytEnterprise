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
    <section className="mb-8 rounded-card bg-gradient-to-r from-[#14583F] to-[#B8E05A] p-[1.5px]" aria-label={t('nav.ai')} data-tour="ask-bar">
      <div className="rounded-[14.5px] bg-surface p-4 sm:p-5">
        <form onSubmit={submit} className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')} className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted" />
          <button type="submit" disabled={!q.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-on-brand transition-opacity disabled:opacity-40" aria-label={t('ai.send')}>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 pl-8">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={() => go(t(`ai.q.${c.key}`))} className="rounded-full border border-line px-3 py-1.5 text-[13px] text-body transition-colors hover:border-brand/40 hover:bg-brand-soft/50 hover:text-ink">
                {t(`ai.q.${c.key}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
