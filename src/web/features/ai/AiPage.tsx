import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUp, Loader2, MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { AI_INTENTS } from '@/data/ai-intents';
import { ask, availableIntents, buildContext } from '@/services/aiAssistant';
import { cn, uid } from '@/lib/utils';
import { useAiStore, type AiConversation } from '@/stores/aiStore';
import { useActor, useCurrentOrg, useFormat, useModules, useT } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';
import { AnswerCard } from './AnswerCard';

/** Intents this person can ask here; `chips` limits to the four dashboard suggestions. */
export function useSuggestions(chips = false) {
  const { orgId, userId, lang } = useActor();
  const modules = useModules();
  const roles = useAccessStore((s) => s.roles);
  const memberships = useAccessStore((s) => s.memberships);
  return useMemo(() => {
    if (!userId) return [];
    void modules;
    void roles;
    void memberships;
    const keys = new Set(availableIntents(buildContext(orgId, userId, lang)).map((i) => i.key));
    const list = AI_INTENTS.filter((i) => keys.has(i.key));
    if (!chips) return list;
    const preferred = list.filter((i) => i.chip);
    return [...preferred, ...list.filter((i) => !i.chip)].slice(0, 4);
  }, [orgId, userId, lang, modules, roles, memberships, chips]);
}

/** Ask your operations (PRD B2): conversation history, answer cards, suggestions. */
export function AiPage() {
  const { orgId, userId, lang } = useActor();
  const org = useCurrentOrg();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const all = useAiStore((s) => s.conversations);
  const conversations = useMemo(() => all.filter((c) => c.orgId === orgId && c.userId === userId), [all, orgId, userId]);
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const suggestions = useSuggestions();
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);
  useDemoNotes([{ id: 'ai', key: 'demo.note.ai' }]);

  const send = async (question: string, conversation: AiConversation | null = active) => {
    const q = question.trim();
    if (!q || !userId || busy) return;
    const store = useAiStore.getState();
    const now = new Date().toISOString();
    let id = conversation?.id;
    if (!id) {
      id = uid('conv');
      store.startConversation({ id, orgId, userId, title: q.slice(0, 80), at: now, messages: [] });
      setActiveId(id);
    }
    store.appendMessage(id, { id: uid('msg'), role: 'user', text: q, at: now });
    setText('');
    setBusy(true);
    const answer = await ask(q, orgId, userId, lang).catch(() => ({ intent: 'error', status: 'error' as const, links: [] }));
    useAiStore.getState().appendMessage(id, { id: uid('msg'), role: 'assistant', answer, at: new Date().toISOString() });
    setBusy(false);
  };

  // Questions from the dashboard bar arrive as ?q=… and start a new conversation.
  useEffect(() => {
    const q = params.get('q');
    if (q && asked.current !== q) {
      asked.current = q;
      setParams({}, { replace: true });
      void send(q, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active?.messages.length, busy]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <>
      <PageHeader title={t('nav.ai')} description={t('ai.pageDesc', { company: org.name })} />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-3" aria-label={t('ai.history')}>
          <Button variant="secondary" className="w-full justify-start" onClick={() => setActiveId(null)}>
            <MessageSquarePlus /> {t('ai.newChat')}
          </Button>
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center">
                <button type="button" onClick={() => setActiveId(c.id)} aria-current={c.id === activeId} className={cn('min-w-0 flex-1 rounded-ctl px-3 py-2 text-left', c.id === activeId ? 'bg-brand-soft text-brand' : 'text-body hover:bg-surface')}>
                  <span className="block truncate text-[14px] font-medium">{c.title}</span>
                  <span className="block text-[12px] text-muted">{f.relative(c.at)}</span>
                </button>
                <Button variant="ghost" size="iconSm" className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={t('ai.delete', { title: c.title })} onClick={() => { useAiStore.getState().removeConversation(c.id); if (c.id === activeId) setActiveId(null); }}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          {!conversations.length && <p className="px-3 text-[13px] text-muted">{t('ai.noHistory')}</p>}
        </aside>

        <section className="flex min-h-[60vh] flex-col rounded-card border border-line bg-canvas/50">
          <div className="flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
            {!active?.messages.length && !busy && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#14583F] to-[#B8E05A] text-white"><Sparkles className="h-5 w-5" /></div>
                <h2 className="text-2xl">{t('ai.emptyTitle', { company: org.name })}</h2>
                <p className="mt-2 text-muted">{t('ai.emptyBody')}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestions.slice(0, 10).map((s) => (
                    <button key={s.key} type="button" onClick={() => void send(t(`ai.q.${s.key}`), null)} className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-ink hover:border-brand/40 hover:bg-brand-soft/40">
                      {t(`ai.q.${s.key}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {active?.messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-[15px] text-white">{m.text}</p>
                </div>
              ) : (
                <div key={m.id}>{m.answer && <AnswerCard answer={m.answer} question={active.messages[i - 1]?.text ?? ''} />}</div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2 text-[14px] text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {t('ai.thinking')}</div>
            )}
            {active?.messages.length ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {suggestions.filter((s) => !active.messages.some((m) => m.answer?.intent === s.key)).slice(0, 4).map((s) => (
                  <button key={s.key} type="button" onClick={() => void send(t(`ai.q.${s.key}`))} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-body hover:border-brand/40">
                    {t(`ai.q.${s.key}`)}
                  </button>
                ))}
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
          <form onSubmit={submit} className="border-t border-line bg-surface p-3">
            <div className="flex items-center gap-2 rounded-ctl border border-line bg-surface px-3 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
              <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')} className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
              <Button type="submit" size="iconSm" disabled={!text.trim() || busy} aria-label={t('ai.send')}><ArrowUp /></Button>
            </div>
            <p className="mt-2 px-1 text-[12px] text-muted">{t('ai.scope', { company: org.name })} <button type="button" className="underline-offset-2 hover:underline" onClick={() => navigate('/app/help')}>{t('ai.learnMore')}</button></p>
          </form>
        </section>
      </div>
    </>
  );
}
