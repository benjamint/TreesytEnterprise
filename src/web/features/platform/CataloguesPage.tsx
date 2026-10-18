import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/shared/DataTable';
import { Flag } from '@/components/shared/Flag';
import { Disclosure } from '@/components/shared/Disclosure';
import { RESOURCES } from '@/engines/permissions';
import { QUESTION_TYPES } from '@/engines/forms';
import { COUNTRIES, CURRENCIES } from '@/data/catalogs/countries';
import { PROVIDER_CATALOG } from '@/data/catalogs/providers';
import { COMMODITY_LIBRARY } from '@/data/templates/companyTemplates';
import { usePlatformStore } from '@/stores/platformStore';
import { useLang, useT } from '@/stores/hooks';
import type { Commodity, Country, Currency } from '@/types';

/** Global catalogues (PRD A3). */
export function CataloguesPage() {
  const lang = useLang();
  const { t } = useT();
  const questionTypes = usePlatformStore((s) => s.questionTypes);
  const setQuestionType = usePlatformStore((s) => s.setQuestionType);

  const countryCols = useMemo<ColumnDef<Country, unknown>[]>(
    () => [
      { header: t('platform.col.country'), id: 'name', accessorFn: (r) => r.name[lang], cell: (c) => <span className="flex items-center gap-2"><Flag code={c.row.original.code} />{c.getValue() as string}</span> },
      { header: t('col.code'), accessorKey: 'code' },
      { header: t('signup.currency'), accessorKey: 'currency' },
      { header: t('platform.col.dial'), accessorKey: 'dialCode' },
      { header: t('signup.language'), accessorKey: 'defaultLanguage', cell: (c) => (c.getValue() as string).toUpperCase() },
      { header: t('platform.col.levels'), id: 'levels', accessorFn: (r) => r.locationLevels.map((l) => l[lang]).join(' → ') },
    ],
    [t, lang],
  );
  const currencyCols = useMemo<ColumnDef<Currency, unknown>[]>(
    () => [
      { header: t('col.code'), accessorKey: 'code', cell: (c) => <span className="font-mono">{c.getValue() as string}</span> },
      { header: t('col.name'), accessorKey: 'name' },
      { header: t('platform.col.minor'), accessorKey: 'minorUnits' },
    ],
    [t],
  );
  const commodityCols = useMemo<ColumnDef<Commodity, unknown>[]>(
    () => [
      { header: t('col.code'), accessorKey: 'code', cell: (c) => <span className="font-mono">{c.getValue() as string}</span> },
      { header: t('col.name'), id: 'name', accessorFn: (r) => r.name[lang] ?? r.name.en },
      { header: t('platform.col.hs'), accessorKey: 'hsCode' },
      { header: t('platform.col.eudr'), accessorKey: 'eudrRelevant', cell: (c) => (c.getValue() ? <Badge tone="warning">{t('platform.eudrYes')}</Badge> : '—') },
    ],
    [t, lang],
  );

  return (
    <Tabs defaultValue="countries">
      <TabsList>
        {['countries', 'currencies', 'commodities', 'questionTypes', 'permissions', 'providers'].map((k) => (
          <TabsTrigger key={k} value={k}>{t(`platform.cat.${k}`)}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="countries"><DataTable columns={countryCols} data={COUNTRIES} /></TabsContent>
      <TabsContent value="currencies"><DataTable columns={currencyCols} data={CURRENCIES} /></TabsContent>
      <TabsContent value="commodities"><DataTable columns={commodityCols} data={COMMODITY_LIBRARY} pageSize={20} /></TabsContent>
      <TabsContent value="questionTypes">
        <div className="grid gap-2 rounded-card border border-line bg-surface p-4 shadow-soft sm:grid-cols-2 xl:grid-cols-3">
          {QUESTION_TYPES.map((q) => (
            <label key={q} className="flex items-center justify-between gap-3 rounded-ctl px-3 py-2.5 hover:bg-canvas">
              <span className="text-[14px] text-ink">{t(`question.${q}`)}</span>
              <Switch checked={questionTypes[q] !== false} onCheckedChange={(v) => setQuestionType(q, v)} aria-label={t(`question.${q}`)} />
            </label>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="permissions">
        <div className="rounded-card border border-line bg-surface px-6 shadow-soft">
          {[...new Set(RESOURCES.map((r) => r.module))].map((mod) => (
            <Disclosure key={mod} title={t(`module.${mod}`, { defaultValue: mod })} badge={<span className="tnum text-[12px] text-muted">{RESOURCES.filter((r) => r.module === mod).reduce((n, r) => n + r.actions.length, 0)}</span>}>
              <ul className="space-y-2">
                {RESOURCES.filter((r) => r.module === mod).map((r) => (
                  <li key={r.resource} className="text-[13px]">
                    <span className="font-medium text-ink">{t(`nav.${r.resource}`, { defaultValue: r.resource })}</span>
                    <span className="ml-2 font-mono text-muted">{r.actions.map((a) => `${r.resource}.${a}`).join('  ')}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="providers">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {COUNTRIES.map((c) => {
            const list = PROVIDER_CATALOG.filter((p) => p.country === c.code);
            return (
              <div key={c.code} className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <div className="mb-3 flex items-center gap-2 font-semibold text-ink"><Flag code={c.code} />{c.name[lang]}</div>
                <div className="flex flex-wrap gap-1.5">
                  {[...list.map((p) => p.name), t('platform.cashProvider')].map((n) => <Badge key={n}>{n}</Badge>)}
                </div>
                <div className="mt-3 text-[12px] text-muted">{t('platform.smsProviders', { list: c.smsProviders.join(', ') })}</div>
              </div>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}
