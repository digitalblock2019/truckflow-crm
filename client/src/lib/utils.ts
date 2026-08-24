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
  sales_and_dispatcher: "Sales & Dispatcher",
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

// "12th Sep 2026" style formatter. Used in customer-facing surfaces
// (self-onboarding form, emails) where a friendlier date reads better than
// ISO or the default en-US long form.
function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
}
export function formatOrdinalDate(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day}${ordinalSuffix(day)} ${month} ${year}`;
}

// Same day/month/year as formatOrdinalDate, plus time (12h clock).
// e.g. "12th Sep 2026, 3:45 PM"
export function formatOrdinalDateTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatOrdinalDate(date)}, ${time}`;
}
