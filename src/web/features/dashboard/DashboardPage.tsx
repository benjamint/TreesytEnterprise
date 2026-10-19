import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRight, GripVertical, LayoutGrid, Lock, Plus, Radar, RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RoleTemplate } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/PageHeader';
import { useDemoNotes } from '@/components/shared/useDemoNotes';
import { usePageTour } from '@/components/shared/PageTour';
import { previewNumber } from '@/engines/numbering';
import { toMinor } from '@/engines/money';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { TOUR_EVENT } from '@/web/layout/HelpMenu';
import { AskBar } from '@/web/features/ai/AskBar';
import { useAccessStore } from '@/stores/accessStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDashboardStore, type WidgetPlacement, type WidgetSize } from '@/stores/dashboardStore';
import { useActor, useCan, useCurrentOrg, useCurrentUser, useFormat, useLang, useModules, useT } from '@/stores/hooks';
import { SetupChecklist } from './SetupChecklist';
import { useDashboardData } from './useDashboardData';
import { DataContext, WIDGETS, widgetById } from './widgets';

const SPAN: Record<WidgetSize, string> = { third: 'xl:col-span-4', half: 'xl:col-span-6', twoThirds: 'xl:col-span-8', full: 'xl:col-span-12' };
const SIZE_ORDER: WidgetSize[] = ['third', 'half', 'twoThirds', 'full'];
const p = (id: string, size: WidgetSize): WidgetPlacement => ({ id, size });

/** Role-based default layouts (PRD B1 "Role-based default layouts"). */
function roleDefault(template: RoleTemplate | undefined): WidgetPlacement[] {
  switch (template) {
    case 'financeOfficer':
      return [p('kpis', 'full'), p('approvals', 'twoThirds'), p('alerts', 'third'), p('payoutsByProvider', 'half'), p('wallets', 'half'), p('purchasesByWeek', 'twoThirds'), p('recoveryProgress', 'third')];
    case 'logisticsManager':
    case 'warehouseManager':
      return [p('approvals', 'twoThirds'), p('alerts', 'third'), p('stockByWarehouse', 'third'), p('map', 'twoThirds'), p('purchasesByWeek', 'full')];
    case 'meOfficer':
    case 'sustainabilityOfficer':
    case 'fieldSupervisor':
      return [p('map', 'twoThirds'), p('alerts', 'third'), p('topCommunities', 'half'), p('activity', 'half')];
    case 'salesOfficer':
      return [p('stockByWarehouse', 'half'), p('alerts', 'half'), p('activity', 'third'), p('volumeByCommodity', 'third')];
    case 'auditor':
      return [p('kpis', 'full'), p('activity', 'half'), p('alerts', 'half')];
    case 'buyerUser':
      return [p('activity', 'half'), p('alerts', 'half')];
    default:
      return [
        p('kpis', 'full'), p('approvals', 'twoThirds'), p('alerts', 'third'), p('purchasesByWeek', 'twoThirds'), p('volumeByCommodity', 'third'),
        p('topCommunities', 'third'), p('payoutsByProvider', 'third'), p('recoveryProgress', 'third'), p('map', 'twoThirds'), p('stockByWarehouse', 'third'),
      ];
  }
}

function useLayout() {
  const { orgId, userId } = useActor();
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const own = useDashboardStore((s) => s.layouts[`${orgId}:${userId}`]);
  const company = useDashboardStore((s) => s.companyDefaults[orgId]);
  const template = useMemo(() => {
    const m = memberships.find((x) => x.userId === userId && x.orgId === orgId);
    return roles.find((r) => r.id === m?.roleIds[0])?.template;
  }, [memberships, roles, userId, orgId]);
  const fallback = useMemo(() => company ?? roleDefault(template), [company, template]);
  return { layout: own ?? fallback, fallback, custom: !!own, source: own ? 'mine' : company ? 'company' : 'role' };
}

/** Home dashboard (PRD B1): ask bar, setup checklist, then a customisable widget board. */
export function DashboardPage() {
  const org = useCurrentOrg();
  const user = useCurrentUser();
  const { orgId, userId } = useActor();
  const settings = useSettingsStore((s) => s.settings[orgId])!;
  const sequences = useSettingsStore((s) => s.sequences[orgId]);
  const countries = usePlatformStore((s) => s.countries);
  const navigate = useNavigate();
  const lang = useLang();
  const f = useFormat();
  const { t } = useT();
  const can = useCan();
  const modules = useModules();
  const data = useDashboardData();
  const { layout, fallback, custom, source } = useLayout();
  const [editing, setEditing] = useState<WidgetPlacement[] | null>(null);
  const [library, setLibrary] = useState(false);
  const tour = usePageTour();
  const startTour = tour.start;
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, startTour);
    return () => window.removeEventListener(TOUR_EVENT, startTour);
  }, [startTour]);

  const isOperational = org.type !== 'BUYER' && org.type !== 'PLATFORM';
  const allowed = (id: string) => {
    const w = widgetById(id);
    if (!w) return 'missing' as const;
    if (w.module && !modules[w.module]) return 'module' as const;
    if (!can(w.permission)) return 'permission' as const;
    if (w.operational && !isOperational) return 'module' as const;
    return 'ok' as const;
  };
  const board = editing ?? layout;
  const visible = board.filter((w) => allowed(w.id) === 'ok');

  // How this company is configured — demo-only facts go to the Demo panel, not the page.
  const country = countries.find((c) => c.code === org.countries[0]);
  const prWorkflow = settings.workflows.find((w) => w.docType === 'purchaseRequest');
  const prPattern = settings.numbering.find((x) => x.docType === 'purchaseRequest');
  const weekLabel = formatDate(new Date(2026, 0, org.weekStart === 0 ? 4 : org.weekStart === 6 ? 10 : 5), org.timezone, lang, 'EEEE');
  useDemoNotes([
    { id: 'dash', key: 'demo.note.dashboardLive' },
    ...([
      ['country', country?.name[lang] ?? org.countries[0]!],
      ['currency', `${org.currency} · ${f.money(toMinor(1_234_567.5, org.currency))}`],
      ['timezone', `${org.timezone} · ${f.dateTime(new Date())}`],
      ['weekStart', weekLabel],
      ['levels', settings.locationLevels.map((l) => l.label[lang] ?? l.label.en).join(' → ')],
      ['approval', prWorkflow ? prWorkflow.steps.map((s) => s.name).join(' → ') : '—'],
      ['numbering', prPattern ? previewNumber(prPattern, sequences ?? {}) : '—'],
    ] as [string, string][]).map(([k, v]) => ({ id: k, key: 'demo.note.fact', params: { label: t(`dashboard.fact.${k}`), value: v } })),
  ]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!editing || !e.over || e.active.id === e.over.id) return;
    const from = editing.findIndex((w) => w.id === e.active.id);
    const to = editing.findIndex((w) => w.id === e.over!.id);
    setEditing(arrayMove(editing, from, to));
  };
  const saveMine = () => {
    useDashboardStore.getState().saveLayout(orgId, userId ?? '', editing!);
    setEditing(null);
    toast.success(t('dashboard.savedMine'));
  };
  const saveCompany = () => {
    useDashboardStore.getState().saveCompanyDefault(orgId, editing!);
    useDashboardStore.getState().resetLayout(orgId, userId ?? '');
    setEditing(null);
    toast.success(t('dashboard.savedCompany', { company: org.name }));
  };

  return (
    <DataContext.Provider value={data}>
      {tour.element}
      <PageHeader
        eyebrow={t('dashboard.subtitle', { company: org.name })}
        title={t('dashboard.greeting', { name: user?.name.split(' ')[0] ?? '' })}
        description={t('pages.dashboard')}
        onTour={startTour}
        actions={
          editing ? null : (
            <Button variant="secondary" onClick={() => setEditing(layout)} data-tour="customise">
              <LayoutGrid /> {t('dashboard.customise')}
            </Button>
          )
        }
      />

      {!editing && <AskBar />}
      {!editing && <SetupChecklist />}

      {editing && (
        <div className="sticky top-16 z-20 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/30 bg-surface/95 px-5 py-3 shadow-soft backdrop-blur">
          <span className="text-[14px] text-body">{t('dashboard.editHint')}</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLibrary(true)}><Plus /> {t('dashboard.addWidget')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(fallback)}><RotateCcw /> {t('dashboard.resetDefault')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            {can('dashboard.setDefault') && <Button variant="secondary" size="sm" onClick={saveCompany}>{t('dashboard.saveCompany')}</Button>}
            <Button size="sm" onClick={saveMine}><Save /> {t('dashboard.saveMine')}</Button>
          </div>
        </div>
      )}

      {!isOperational && !editing && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="text-xl">{t('dashboard.buyerTitle')}</h2>
              <p className="mt-1 text-muted">{t('dashboard.buyerBody', { company: org.name })}</p>
            </div>
            {modules.traceboard && <Button onClick={() => navigate('/app/traceboard')}><Radar /> {t('nav.traceboard')} <ArrowRight /></Button>}
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12" data-tour="widgets">
            {visible.map((w) => (
              <WidgetCard
                key={w.id}
                placement={w}
                editing={!!editing}
                onResize={(size) => setEditing((e) => e!.map((x) => (x.id === w.id ? { ...x, size } : x)))}
                onRemove={() => setEditing((e) => e!.filter((x) => x.id !== w.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!visible.length && <p className="rounded-card border border-dashed border-line px-6 py-12 text-center text-muted">{t('dashboard.emptyBoard')}</p>}
      {!editing && <p className="mt-6 text-center text-[12px] text-muted">{t(`dashboard.layoutSource.${source}`, { company: org.name })}{custom && <Button variant="link" size="xs" onClick={() => useDashboardStore.getState().resetLayout(orgId, userId ?? '')}>{t('dashboard.useDefault')}</Button>}</p>}

      <Sheet open={library} onOpenChange={setLibrary}>
        <SheetContent closeLabel={t('common.close')} className="overflow-y-auto p-6">
          <SheetTitle className="text-xl font-semibold text-ink">{t('dashboard.library')}</SheetTitle>
          <SheetDescription className="mt-1 text-[14px] text-muted">{t('dashboard.libraryHint')}</SheetDescription>
          <ul className="mt-6 space-y-2">
            {WIDGETS.map((w) => {
              const state = allowed(w.id);
              const on = !!editing?.some((x) => x.id === w.id);
              return (
                <li key={w.id} className="flex items-center gap-3 rounded-ctl border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{t(`dashboard.widget.${w.id}`)}</div>
                    <div className="text-[13px] text-muted">{t(`dashboard.widgetDesc.${w.id}`)}</div>
                    {state === 'module' && <Badge tone="neutral" className="mt-1">{t('dashboard.needsModule', { module: t(`module.${w.module}`) })}</Badge>}
                    {state === 'permission' && <Badge tone="neutral" className="mt-1"><Lock className="h-3 w-3" /> {t('common.missingPermission', { permission: w.permission })}</Badge>}
                  </div>
                  {on ? (
                    <Badge tone="brand">{t('dashboard.onBoard')}</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={state !== 'ok'} onClick={() => setEditing((e) => [...(e ?? []), { id: w.id, size: w.sizes[Math.min(1, w.sizes.length - 1)]! }])}>
                      <Plus /> {t('dashboard.add')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </DataContext.Provider>
  );
}

function WidgetCard({ placement, editing, onResize, onRemove }: { placement: WidgetPlacement; editing: boolean; onResize: (s: WidgetSize) => void; onRemove: () => void }) {
  const def = widgetById(placement.id)!;
  const { t } = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: placement.id, disabled: !editing });
  const Body = def.component;
  const sizes = SIZE_ORDER.filter((s) => def.sizes.includes(s));
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('min-w-0 rounded-card border bg-surface p-5 shadow-soft', SPAN[placement.size], editing ? 'border-dashed border-brand/40' : 'border-line', isDragging && 'z-10 opacity-90 shadow-lift')}
      aria-label={t(`dashboard.widget.${def.id}`)}
    >
      <header className="mb-4 flex items-center gap-2">
        {editing && (
          <button type="button" {...attributes} {...listeners} className="cursor-grab rounded p-1 text-muted hover:bg-canvas active:cursor-grabbing" aria-label={t('dashboard.move', { widget: t(`dashboard.widget.${def.id}`) })}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">{t(`dashboard.widget.${def.id}`)}</h2>
        {editing && sizes.length > 1 && (
          <div className="flex rounded-chip border border-line p-0.5" role="radiogroup" aria-label={t('dashboard.size')}>
            {sizes.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={placement.size === s} onClick={() => onResize(s)} className={cn('rounded-[6px] px-2 py-0.5 text-[12px] font-medium', placement.size === s ? 'bg-brand text-white' : 'text-muted hover:text-ink')}>
                {t(`dashboard.sizeName.${s}`)}
              </button>
            ))}
          </div>
        )}
        {editing && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" aria-label={t('dashboard.remove', { widget: t(`dashboard.widget.${def.id}`) })}>
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      <div className={cn(editing && 'pointer-events-none select-none opacity-80')}>
        <Body />
      </div>
    </section>
  );
}
