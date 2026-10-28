import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Code2, Keyboard, Pencil, PlayCircle, Plus, RotateCcw, Search, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { KbArticle } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/shared/Gates';
import { EmptyState } from '@/components/shared/EmptyState';
import { SelectField, TextAreaField, TextField } from '@/components/shared/Field';
import { articleBody, articleTitle, saveArticle, searchArticles } from '@/services/systemService';
import { resetDemoData } from '@/stores/persistence';
import { useSystemStore } from '@/stores/systemStore';
import { useActor, useCurrentOrg, useFormat, useLang, useT } from '@/stores/hooks';
import { SHORTCUTS_EVENT, TOUR_EVENT } from '@/web/layout/HelpMenu';
import { cn } from '@/lib/utils';
import { Markdown, useUserName } from './shared';

const CATEGORIES = ['basics', 'workflows', 'buying', 'payments', 'mobile', 'fieldTeam', 'land', 'reports', 'security', 'integrations'];
const TOURS = [{ key: 'dashboard', to: '/app' }, { key: 'communities', to: '/app/communities' }, { key: 'groups', to: '/app/groups' }];

/** Help centre (PRD K7): searchable articles (global and the company's own), tours, shortcuts, mobile previews, API reference, reset demo. */
export function HelpPage() {
  const { t } = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const { orgId } = useActor();
  const org = useCurrentOrg();
  const all = useSystemStore((s) => s.articles);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<KbArticle | 'new' | null>(null);
  const [resetting, setResetting] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const found = useMemo(() => searchArticles(orgId, q, lang).filter((a) => !category || a.category === category), [all, orgId, q, lang, category]);
  const slug = params.get('a');
  const current = (slug && found.find((a) => a.slug === slug)) || (slug && all.find((a) => a.slug === slug && (!a.orgId || a.orgId === orgId))) || found[0];
  const cats = CATEGORIES.filter((c) => searchArticles(orgId, '', lang).some((a) => a.category === c));
  const tour = (to: string) => { navigate(to); setTimeout(() => window.dispatchEvent(new Event(TOUR_EVENT)), 400); };
  return (
    <>
      <PageHeader eyebrow={t('help.eyebrow')} title={t('help.title')} description={t('help.description', { company: org.name })}
        primary={<PermissionGate permission="settings.edit"><Button onClick={() => setEditing('new')}><Plus /> {t('help.newArticle')}</Button></PermissionGate>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <QuickCard icon={Keyboard} title={t('help.quick.shortcuts')} body={t('help.quick.shortcutsHint')} onClick={() => window.dispatchEvent(new Event(SHORTCUTS_EVENT))} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><div><QuickCard icon={PlayCircle} title={t('help.quick.tours')} body={t('help.quick.toursHint')} /></div></DropdownMenuTrigger>
          <DropdownMenuContent align="start">{TOURS.map((x) => <DropdownMenuItem key={x.key} onSelect={() => tour(x.to)}>{t(`help.tour.${x.key}`)}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
        <QuickCard icon={Smartphone} title={t('help.quick.mobile')} body={t('help.quick.mobileHint')} to="/app/help/mobile" />
        <QuickCard icon={Code2} title={t('help.quick.api')} body={t('help.quick.apiHint')} to="/app/help/api" />
        <QuickCard icon={RotateCcw} title={t('shell.resetDemo')} body={t('help.quick.resetHint')} onClick={() => setResetting(true)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('help.search')} aria-label={t('help.search')} className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('help.categories')}>
            <button type="button" role="tab" aria-selected={!category} onClick={() => setCategory('')} className={cn('rounded-full border px-2.5 py-1 text-[12px]', !category ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body')}>{t('help.allTopics')}</button>
            {cats.map((c) => <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', category === c ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body')}>{t(`help.cat.${c}`)}</button>)}
          </div>
          {found.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {found.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setParams({ a: a.slug })} aria-current={current?.id === a.id} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas', current?.id === a.id && 'bg-brand-soft/40')}>
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-ink">{articleTitle(a, lang)}</span><span className="block text-[12px] text-muted">{`${t(`help.cat.${a.category}`)}${a.orgId ? ` · ${org.name}` : ''}`}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-card border border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">{t('help.noResults', { q })}</p>}
        </aside>
        {current ? <ArticleView a={current} onEdit={() => setEditing(current)} /> : <EmptyState title={t('help.noArticles')} />}
      </div>
      {editing && <ArticleEditor a={editing === 'new' ? undefined : editing} onClose={(s) => { setEditing(null); if (s) setParams({ a: s }); }} />}
      <Dialog open={resetting} onOpenChange={setResetting}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('help.resetTitle')}</DialogTitle><DialogDescription>{t('help.resetHint')}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="secondary" onClick={() => setResetting(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => resetDemoData()}>{t('shell.resetDemo')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuickCard({ icon: Icon, title, body, onClick, to }: { icon: typeof Keyboard; title: string; body: string; onClick?: () => void; to?: string }) {
  const cls = 'flex h-full w-full items-start gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-soft transition hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  const inner = <><span className="rounded-full bg-brand-soft p-2 text-brand"><Icon className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-[14px] font-semibold text-ink">{title}</span><span className="block text-[12px] text-muted">{body}</span></span></>;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function ArticleView({ a, onEdit }: { a: KbArticle; onEdit: () => void }) {
  const { t } = useT();
  const lang = useLang();
  const f = useFormat();
  const org = useCurrentOrg();
  const userName = useUserName();
  const translated = !!a.body[lang];
  return (
    <article className="min-w-0 rounded-card border border-line bg-surface p-6 shadow-soft">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge tone={a.orgId ? 'brand' : 'neutral'}>{a.orgId ? t('help.companyOnly', { company: org.name }) : t('help.global')}</Badge>
        <Badge tone="neutral">{t(`help.cat.${a.category}`)}</Badge>
        {!translated && <Badge tone="warning">{t('help.notTranslated')}</Badge>}
        {a.orgId && <PermissionGate permission="settings.edit"><Button size="sm" variant="ghost" className="ml-auto" onClick={onEdit}><Pencil /> {t('help.edit')}</Button></PermissionGate>}
      </div>
      <h2 className="mb-1 text-[26px] leading-tight text-ink">{articleTitle(a, lang)}</h2>
      <p className="mb-5 text-[13px] text-muted">{t('help.updated', { name: userName(a.updatedBy), date: f.date(a.updatedAt) })}</p>
      <Markdown source={articleBody(a, lang)} />
      {a.tags.length > 0 && <div className="mt-6 flex flex-wrap gap-1.5 border-t border-line pt-4">{a.tags.map((x) => <Badge key={x} tone="neutral">{`#${x}`}</Badge>)}</div>}
    </article>
  );
}

function ArticleEditor({ a, onClose }: { a?: KbArticle; onClose: (slug?: string) => void }) {
  const { t } = useT();
  const lang = useLang();
  const { orgId, userId } = useActor();
  const [title, setTitle] = useState(a ? articleTitle(a, lang) : '');
  const [body, setBody] = useState(a ? articleBody(a, lang) : '');
  const [category, setCategory] = useState(a?.category ?? 'basics');
  const [tags, setTags] = useState(a?.tags.join(', ') ?? '');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{a ? t('help.editTitle') : t('help.newArticle')}</DialogTitle><DialogDescription>{t('help.editorHint', { lang: lang.toUpperCase() })}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t('help.articleTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <SelectField label={t('help.category')} value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((c) => ({ value: c, label: t(`help.cat.${c}`) }))} />
        </div>
        <TextField label={t('help.tags')} value={tags} onChange={(e) => setTags(e.target.value)} helper={t('help.tagsHint')} />
        <Tabs defaultValue="write">
          <TabsList><TabsTrigger value="write">{t('help.write')}</TabsTrigger><TabsTrigger value="preview">{t('help.previewTab')}</TabsTrigger></TabsList>
          <TabsContent value="write" className="mt-3"><TextAreaField label={t('help.body')} value={body} onChange={(e) => setBody(e.target.value)} rows={12} helper={t('help.markdownHint')} className="font-mono" /></TabsContent>
          <TabsContent value="preview" className="mt-3 max-h-80 overflow-y-auto rounded-ctl border border-line p-4"><Markdown source={body || t('help.emptyPreview')} /></TabsContent>
        </Tabs>
        <DialogFooter><Button variant="secondary" onClick={() => onClose()}>{t('common.cancel')}</Button><Button disabled={!title.trim() || !body.trim()} onClick={() => { const x = saveArticle(orgId, userId ?? 'system', { id: a?.id, title: title.trim(), body, category, tags: tags.split(',').map((s) => s.trim()).filter(Boolean), lang }); toast.success(t('help.saved')); onClose(x.slug); }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
