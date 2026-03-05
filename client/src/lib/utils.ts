import type { PaginatedResponse } from "@/types";

export function totalPages<T>(res: PaginatedResponse<T> | undefined): number {
  if (!res) return 1;
  return Math.max(1, Math.ceil(res.total / res.limit));
}

export function fmt(cents: number | null | undefined): string {
  if (cents == null) return "$0.00";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const typeLabels: Record<string, string> = {
  sales_agent: "Sales Rep",
  dispatcher: "Dispatcher",
  fixed_salary: "Staff",
  contractor: "Contractor",
};

export function employeeTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return typeLabels[type] || type.replace(/_/g, " ");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
