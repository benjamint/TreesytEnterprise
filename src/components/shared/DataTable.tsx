import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useFormat, useT } from '@/stores/hooks';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

interface Props<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  pageSize?: number;
  onRowClick?: (row: T) => void;
  /** Row id for selection (enables checkboxes). */
  getRowId?: (row: T) => string;
  /** Bulk actions for the selected rows. */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
  /** Column picker (columns need an `id` or `accessorKey`). */
  columnPicker?: boolean;
  initialHidden?: string[];
  /** CSV export of the filtered rows. */
  exportCsv?: { fileName: string; columns: ExportColumn<T>[] };
  empty?: ReactNode;
  /** Highlights the row whose drawer is open. */
  activeId?: string | null;
}

export function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]) {
  const esc = (s: string | number) => {
    const v = String(s ?? '');
    return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = `\uFEFF${[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Table with sorting, paging, row selection with bulk actions, column picker and CSV export (PRD 6.2). */
export function DataTable<T>({ columns, data, pageSize = 10, onRowClick, getRowId, bulkActions, columnPicker, initialHidden = [], exportCsv, empty, activeId }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(initialHidden.map((id) => [id, false])));
  const { t } = useT();
  const f = useFormat();
  const selectable = !!getRowId && !!bulkActions;

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: '_select',
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <input type="checkbox" aria-label={t('table.selectAll')} checked={table.getIsAllPageRowsSelected()} ref={(el) => { if (el) el.indeterminate = table.getIsSomePageRowsSelected(); }} onChange={table.getToggleAllPageRowsSelectedHandler()} className="h-4 w-4 cursor-pointer accent-[rgb(var(--brand))]" />
        ),
        cell: ({ row }) => <input type="checkbox" aria-label={t('table.selectRow')} checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()} onChange={row.getToggleSelectedHandler()} className="h-4 w-4 cursor-pointer accent-[rgb(var(--brand))]" />,
      },
      ...columns,
    ];
  }, [columns, selectable, t]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection: selection, columnVisibility: visibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    autoResetPageIndex: true,
  });
  // Selection is dropped for rows that leave the data (filters, deletes).
  useEffect(() => {
    if (!getRowId) return;
    const ids = new Set(data.map(getRowId));
    setSelection((s) => {
      const next = Object.fromEntries(Object.entries(s).filter(([id]) => ids.has(id)));
      return Object.keys(next).length === Object.keys(s).length ? s : next;
    });
  }, [data, getRowId]);

  const selectedRows = table.getSelectedRowModel().flatRows.map((r) => r.original);
  const { pageIndex } = table.getState().pagination;
  const from = data.length === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(data.length, (pageIndex + 1) * pageSize);
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== '_select');
  const exportRows = () => {
    if (!exportCsv) return;
    const rows = table.getSortedRowModel().rows.map((r) => r.original);
    downloadCsv(exportCsv.fileName, exportCsv.columns.map((c) => c.header), rows.map((r) => exportCsv.columns.map((c) => c.value(r))));
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
      {(columnPicker || exportCsv || selectedRows.length > 0) && (
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
          {selectedRows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium text-ink">{t('table.selected', { count: selectedRows.length })}</span>
              {bulkActions?.(selectedRows, () => setSelection({}))}
              <Button variant="ghost" size="sm" onClick={() => setSelection({})}>{t('table.clearSelection')}</Button>
            </div>
          ) : (
            <span className="text-[13px] text-muted">{t('table.count', { count: data.length, n: f.number(data.length) })}</span>
          )}
          <div className="flex gap-2">
            {columnPicker && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm"><Columns3 /> {t('table.columns')}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>{t('table.showColumns')}</DropdownMenuLabel>
                  {hideable.map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                      {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {exportCsv && <Button variant="ghost" size="sm" onClick={exportRows} disabled={!data.length}><Download /> {t('common.export')}</Button>}
          </div>
        </div>
      )}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead className="sticky top-0 bg-canvas">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" className={cn('h-11 whitespace-nowrap border-b border-line px-4 text-left align-middle', h.column.id === '_select' && 'w-10 pr-0')}>
                      {h.isPlaceholder ? null : h.column.id === '_select' ? (
                        flexRender(h.column.columnDef.header, h.getContext())
                      ) : (
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
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn('h-[52px] border-b border-line last:border-0 transition-colors hover:bg-brand-soft/50', onRowClick && 'cursor-pointer', (row.getIsSelected() || (activeId && row.id === activeId)) && 'bg-brand-soft/40')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn('tnum whitespace-nowrap px-4 align-middle text-body', cell.column.id === '_select' && 'w-10 pr-0')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="px-6 py-12 text-center text-[14px] text-muted">{empty ?? t('table.empty')}</div>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
        <span className="tnum">{`${f.number(from)}–${f.number(to)} / ${f.number(data.length)}`}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="iconSm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={t('table.previous')}>
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="iconSm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={t('table.next')}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
