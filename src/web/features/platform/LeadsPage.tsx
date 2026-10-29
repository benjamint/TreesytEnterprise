import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Lead } from '@/types';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/DataTable';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { usePlatformStore } from '@/stores/platformStore';
import { useFormat, useT } from '@/stores/hooks';

/** Leads (PRD A3): book-a-demo, contact and sign-up submissions. */
export function LeadsPage() {
  const leads = usePlatformStore((s) => s.leads);
  const [open, setOpen] = useState<Lead | null>(null);
  const f = useFormat();
  const { t } = useT();
  const sorted = useMemo(() => [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [leads]);
  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      { header: t('col.date'), accessorKey: 'createdAt', cell: (c) => f.date(c.getValue() as string) },
      { header: t('col.type'), accessorKey: 'kind', cell: (c) => <Badge tone={c.getValue() === 'SIGNUP' ? 'success' : c.getValue() === 'DEMO' ? 'brand' : 'neutral'}>{t(`platform.leadKind.${c.getValue() as string}`)}</Badge> },
      { header: t('col.name'), id: 'name', accessorFn: (r) => `${r.firstName} ${r.lastName}` },
      { header: t('demoForm.business'), accessorKey: 'businessName' },
      { header: t('auth.workEmail'), accessorKey: 'email' },
      { header: t('demoForm.industry'), accessorKey: 'industry', cell: (c) => (c.getValue() ? t(`demoForm.industries.${c.getValue() as string}`, { defaultValue: c.getValue() as string }) : '—') },
    ],
    [t, f],
  );
  return (
    <>
      <DataTable columns={columns} data={sorted} onRowClick={setOpen} />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent closeLabel={t('common.close')} className="p-8">
          {open && (
            <>
              <SheetTitle className="text-xl font-semibold text-ink">{open.businessName}</SheetTitle>
              <SheetDescription className="mt-1 text-muted">{`${open.firstName} ${open.lastName} · ${f.dateTime(open.createdAt)}`}</SheetDescription>
              <dl className="mt-6 divide-y divide-line">
                {[
                  ['col.type', t(`platform.leadKind.${open.kind}`)],
                  ['auth.workEmail', open.email],
                  ['demoForm.phone', open.phone || '—'],
                  ['demoForm.industry', open.industry ? t(`demoForm.industries.${open.industry}`, { defaultValue: open.industry }) : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[140px_1fr] gap-3 py-3 text-[14px]"><dt className="eyebrow pt-0.5">{t(k!)}</dt><dd className="text-ink">{v}</dd></div>
                ))}
              </dl>
              {open.message && <p className="mt-6 rounded-ctl bg-canvas p-4 text-[14px] leading-relaxed text-body">{open.message}</p>}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
