"use client";

import React from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataGridProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  toolbar?: React.ReactNode;
  loading?: boolean;
  page?: number;
  totalPages?: number;
  total?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DataGrid<T extends Record<string, any>>({
  columns,
  data,
  keyField = "id",
  toolbar,
  loading,
  page = 1,
  totalPages = 1,
  total,
  pageSize,
  onPageChange,
  onRowClick,
  emptyMessage = "No records found",
}: DataGridProps<T>) {
  const hasPaging = totalPages > 1 && !!onPageChange;
  const showFooter = hasPaging || total !== undefined;
  const effectivePageSize = pageSize ?? data.length;
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1;
  const rangeEnd = total !== undefined
    ? Math.min(rangeStart + data.length - 1, total)
    : rangeStart + data.length - 1;
  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      {toolbar && (
        <div className="px-4 py-3 border-b border-border flex gap-2.5 items-center bg-[#fafbfc] flex-wrap">
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-[#f8f9fb]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3.5 py-2.5 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border whitespace-nowrap ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-3.5 py-12 text-center text-txt-light">
                  Loading...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3.5 py-12 text-center text-txt-light">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={(row[keyField] as string) ?? i}
                  onClick={() => onRowClick?.(row)}
                  className={`group ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3.5 py-2.5 border-b border-[#f0f2f5] text-txt align-middle group-hover:bg-[#f8faff] ${col.className ?? ""}`}
                    >
                      {col.render
                        ? col.render(row)
                        : (row[col.key] as React.ReactNode) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showFooter && (
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-txt-mid bg-[#fafbfc]">
          <span>
            {total !== undefined ? (
              hasPaging ? (
                <>
                  Page {page} of {totalPages}
                  <span className="text-txt-light"> · </span>
                  Showing {rangeStart}–{rangeEnd} of {total}
                </>
              ) : (
                <>{total} {total === 1 ? "record" : "records"}</>
              )
            ) : (
              <>Page {page} of {totalPages}</>
            )}
          </span>
          {hasPaging && (
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => onPageChange!(page - 1)}
                className="px-2.5 py-1 border border-border rounded bg-white disabled:opacity-40 hover:bg-surface cursor-pointer"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => onPageChange!(page + 1)}
                className="px-2.5 py-1 border border-border rounded bg-white disabled:opacity-40 hover:bg-surface cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
