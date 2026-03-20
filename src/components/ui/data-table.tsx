"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Search, Inbox } from "lucide-react";
import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchKey?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyActionLabel?: string;
  emptyActionHref?: string;
  pageSize?: number;
  className?: string;
  // Server-side pagination (opt-in)
  manualPagination?: boolean;
  pageCount?: number;
  pageIndex?: number;
  onPageChange?: (pageIndex: number) => void;
  totalRows?: number;
  isFetching?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Buscar...",
  searchKey,
  isLoading = false,
  emptyMessage = "No se encontraron resultados.",
  emptyActionLabel,
  emptyActionHref,
  pageSize = 10,
  className,
  manualPagination = false,
  pageCount,
  pageIndex,
  onPageChange,
  totalRows: totalRowsProp,
  isFetching = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [searchValue, setSearchValue] = React.useState("");
  const debouncedSearch = useDebounce(searchValue, 300);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(!manualPagination && {
      getPaginationRowModel: getPaginationRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
    }),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    ...(manualPagination
      ? {
          manualPagination: true,
          pageCount: pageCount ?? -1,
          state: {
            sorting,
            columnFilters,
            pagination: {
              pageIndex: pageIndex ?? 0,
              pageSize,
            },
          },
        }
      : {
          state: {
            sorting,
            columnFilters,
          },
          initialState: {
            pagination: { pageSize },
          },
        }),
  });

  // Apply debounced search filter (only in client-side mode)
  React.useEffect(() => {
    if (searchKey && !manualPagination) {
      table.getColumn(searchKey)?.setFilterValue(debouncedSearch);
    }
  }, [debouncedSearch, searchKey, table, manualPagination]);

  // Pagination display values
  const displayTotalRows = manualPagination
    ? (totalRowsProp ?? 0)
    : table.getFilteredRowModel().rows.length;
  const displayCurrentPage = manualPagination
    ? (pageIndex ?? 0) + 1
    : table.getState().pagination.pageIndex + 1;
  const displayTotalPages = manualPagination
    ? (pageCount ?? 1)
    : table.getPageCount();

  // Navigation handlers
  const canPrevious = manualPagination
    ? (pageIndex ?? 0) > 0
    : table.getCanPreviousPage();
  const canNext = manualPagination
    ? displayCurrentPage < displayTotalPages
    : table.getCanNextPage();

  const handlePrevious = () => {
    if (manualPagination) {
      onPageChange?.((pageIndex ?? 0) - 1);
    } else {
      table.previousPage();
    }
  };

  const handleNext = () => {
    if (manualPagination) {
      onPageChange?.((pageIndex ?? 0) + 1);
    } else {
      table.nextPage();
    }
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Search (only in client-side mode) */}
      {searchKey && !manualPagination && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Table */}
      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border",
          isFetching && !isLoading && "opacity-50 pointer-events-none transition-opacity duration-200",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`} className="border-border">
                  {columns.map((_, colIndex) => (
                    <TableCell key={`skeleton-${rowIndex}-${colIndex}`}>
                      <Skeleton className="h-5 w-full max-w-[180px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-border hover:bg-secondary/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              // Empty state
              <TableRow className="border-border">
                <TableCell
                  colSpan={columns.length}
                  className="h-48"
                >
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                      <Inbox className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      {emptyMessage}
                    </p>
                    {emptyActionLabel && emptyActionHref && (
                      <Button asChild className="mt-3" size="sm">
                        <Link href={emptyActionHref}>{emptyActionLabel}</Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && displayTotalRows > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {displayTotalRows} resultado{displayTotalRows !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={!canPrevious}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Pagina {displayCurrentPage} de {displayTotalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={!canNext}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
