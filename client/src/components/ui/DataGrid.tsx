"use client";

import React, { useEffect, useState } from "react";

// Compact page-number list with ellipses. For totalPages <= 7 we just show all
// pages; otherwise we surface first, last, current ± 1, and elide the gaps so
// the bar stays one line wide even at hundreds of pages.
function buildPageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1, 2, total - 1]);
  const sorted = Array.from(pages).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "...")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push("...");
  }
  return out;
}

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
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-3 text-xs text-txt-mid bg-[#fafbfc] flex-wrap">
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
            <Pager page={page} totalPages={totalPages} onPageChange={onPageChange!} />
          )}
        </div>
      )}
    </div>
  );
}

interface PagerProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pager({ page, totalPages, onPageChange }: PagerProps) {
  const pages = buildPageList(page, totalPages);
  const [jumpValue, setJumpValue] = useState(String(page));
  useEffect(() => { setJumpValue(String(page)); }, [page]);

  const commitJump = () => {
    const n = parseInt(jumpValue, 10);
    if (!Number.isFinite(n)) { setJumpValue(String(page)); return; }
    const clamped = Math.max(1, Math.min(totalPages, n));
    if (clamped !== page) onPageChange(clamped);
    setJumpValue(String(clamped));
  };

  const btnBase =
    "min-w-[28px] h-[26px] px-2 border border-border rounded bg-white text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface";
  const btnActive = "!bg-blue !text-white !border-blue hover:!bg-blue";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(1)}
        title="First page"
        aria-label="First page"
        className={btnBase}
      >
        «
      </button>
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={btnBase}
      >
        Prev
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="px-1 text-txt-light">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${p === page ? btnActive : ""}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={btnBase}
      >
        Next
      </button>
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(totalPages)}
        title="Last page"
        aria-label="Last page"
        className={btnBase}
      >
        »
      </button>
      <span className="text-txt-light ml-2">Go to</span>
      <input
        type="number"
        min={1}
        max={totalPages}
        value={jumpValue}
        onChange={(e) => setJumpValue(e.target.value)}
        onBlur={commitJump}
        onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
        aria-label={`Jump to page (1 to ${totalPages})`}
        className="w-14 h-[26px] px-2 border border-border rounded text-xs text-txt bg-white focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
      />
    </div>
  );
}
