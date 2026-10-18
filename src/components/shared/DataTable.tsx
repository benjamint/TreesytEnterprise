import { useState } from 'react';
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFormat, useT } from '@/stores/hooks';

/**
 * Table with sorting and pagination (TanStack Table v8). Phase 1 scaffold; filters, column picker,
 * row selection, bulk actions and export are added with the list pages.
 */
export function DataTable<T>({ columns, data, pageSize = 10, onRowClick }: { columns: ColumnDef<T, unknown>[]; data: T[]; pageSize?: number; onRowClick?: (row: T) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { t } = useT();
  const f = useFormat();
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const { pageIndex } = table.getState().pagination;
  const from = data.length === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(data.length, (pageIndex + 1) * pageSize);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead className="sticky top-0 bg-canvas">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" className="h-11 whitespace-nowrap border-b border-line px-4 text-left align-middle">
                      {h.isPlaceholder ? null : (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="eyebrow inline-flex items-center gap-1 hover:text-ink" disabled={!h.column.getCanSort()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' && <ArrowUp className="h-3 w-3" />}
                          {sorted === 'desc' && <ArrowDown className="h-3 w-3" />}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} onClick={onRowClick ? () => onRowClick(row.original) : undefined} className={cn('h-[52px] border-b border-line last:border-0 transition-colors hover:bg-brand-soft/50', onRowClick && 'cursor-pointer')}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="tnum whitespace-nowrap px-4 align-middle text-body">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
        <span className="tnum">{`${f.number(from)}–${f.number(to)} / ${f.number(data.length)}`}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="iconSm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={t('mobile.back')}>
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="iconSm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={t('common.viewAll')}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
