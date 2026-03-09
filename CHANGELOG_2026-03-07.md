# TruckFlow CRM — Changes Made on March 7, 2026

## 1. Dashboard Page (NEW)

**What changed:** The root page (`/`) now shows a real Dashboard instead of redirecting to `/truckers`.

**Features:**
- **Row 1 — Key Stats**: Total Loads, Net Revenue, Active Truckers, Outstanding Invoices
- **Row 2 — Breakdowns**: Load Status Breakdown (pending/dispatched/in-transit/delivered/payment received) + Commission Summary (pending/approved/paid totals)
- **Row 3 — Overviews**: Invoice Overview (draft/sent/overdue/paid) + Trucker Pipeline (onboarding/fully onboarded) + Active Employee count
- Data is fetched from a new `GET /api/dashboard` backend endpoint (single optimized SQL query)

**Files added:**
- `server/src/services/dashboard.service.ts` — aggregated stats query
- `server/src/routes/dashboard.ts` — dashboard API route

**Files modified:**
- `client/src/app/(dashboard)/page.tsx` — replaced redirect with dashboard UI
- `client/src/lib/hooks.ts` — added `useDashboard()` hook
- `server/src/routes/index.ts` — registered `/dashboard` route with auth

---

## 2. Sidebar — "My Profile" Moved to User Avatar Area

**What changed:** "My Profile" link removed from the Team section in the sidebar navigation. Instead, clicking the user avatar/name area at the bottom of the sidebar now navigates to `/profile`.

**Files modified:**
- `client/src/components/layout/Sidebar.tsx`

---

## 3. Settings Page — Tab Layout

**What changed:** The Settings page now uses a tabbed layout with two tabs:
- **Invoice Branding** tab (default for admins) — company logo, name, address, phone, email, website, footer text, Wise email
- **System Settings** tab — key-value system configuration

Previously both sections were stacked vertically on one page.

**Files modified:**
- `client/src/app/(dashboard)/settings/page.tsx` — added `Tabs` component, extracted `SystemSettingsCard` into its own component

---

## 4. Role-Based Access Control Improvements

### 4a. "People" Tab — Hidden for Non-Admin/Supervisor

**What changed:** The "People" sidebar link is now only visible to `admin` and `supervisor` roles. Sales agents, dispatchers, sales & dispatchers, and viewers cannot see it.

**Files modified:**
- `client/src/components/layout/Sidebar.tsx` — added `supervisorOnly: true` to People nav item

### 4b. Commissions — Scoped to Own Data for Non-Privileged Roles

**What changed:** Users with roles other than `admin` or `supervisor` can now only see their own commissions. Previously, all users could view all commissions.

**How it works:**
- Backend looks up the user's `employee_id` from the `users` table
- Automatically filters commission list and summary queries by that `employee_id`
- Admin and supervisor roles continue to see all commissions

**Files modified:**
- `server/src/controllers/commissions.controller.ts` — added role-based employee_id filtering for `list()` and `summary()` endpoints
- `server/src/services/commissions.service.ts` — added `employee_id` filter support to the `summary()` method

### 4c. Invoice Creation — Expanded to Dispatchers

**What changed:** Invoice creation was previously restricted to `admin` and `supervisor` only. Now `dispatcher` and `sales_and_dispatcher` roles can also create, send, mark paid, and manage invoices.

**Roles that CAN create invoices:** `admin`, `supervisor`, `dispatcher`, `sales_and_dispatcher`
**Roles that CANNOT create invoices:** `sales_agent`, `viewer`

**Files modified:**
- `server/src/routes/invoices.ts` — added `dispatcher` and `sales_and_dispatcher` to `authorize()` on `POST /` (create invoice)
- `client/src/lib/auth.ts` — added `canCreateInvoice()` helper method
- `client/src/app/(dashboard)/invoices/page.tsx` — UI buttons (New Invoice, Send, Mark Paid, Cancel) now use `canCreateInvoice` instead of `isSupervisorOrAdmin`

### 4d. User Role Type Fixed

**What changed:** The frontend `User` type had incorrect role values (`agent` instead of `sales_agent`, missing `sales_and_dispatcher`). Updated to match the actual database enum.

**Before:** `"admin" | "supervisor" | "agent" | "dispatcher" | "viewer"`
**After:** `"admin" | "supervisor" | "sales_agent" | "dispatcher" | "sales_and_dispatcher" | "viewer"`

**Files modified:**
- `client/src/types/index.ts`

---

## 5. Invoice Bug Fixes

### 5a. Invoice Total Showing $0.00 in List — FIXED

**Root cause:** The database column is `total_amount` but the frontend `Invoice` type expected `total_cents`. The field was always `undefined`, rendering as `$0.00`.

**Fix:** Updated the frontend type to use `total_amount`, `subtotal_amount`, and `tax_total_amount` matching the actual API response.

**Files modified:**
- `client/src/types/index.ts` — renamed `total_cents` → `total_amount`, `subtotal_cents` → `subtotal_amount`, `tax_cents` → `tax_total_amount`
- `client/src/app/(dashboard)/invoices/page.tsx` — updated column render to use `r.total_amount`

### 5b. Dates Off by One Day — FIXED

**Root cause:** PostgreSQL `DATE` columns (e.g., `due_date`, `invoice_date`) return date-only strings like `"2026-03-08"`. JavaScript's `new Date("2026-03-08")` parses this as UTC midnight. When displayed with `.toLocaleDateString()` in a timezone behind UTC (e.g., US timezones), the date shifts back one day (March 8 → March 7).

**Fix:** For date-only strings (10 chars), append `T00:00:00` to force local timezone parsing instead of UTC.

**Files modified:**
- `client/src/app/(dashboard)/invoices/page.tsx` — updated `fmtDate()` helper
- `client/src/app/invoice-view/[token]/page.tsx` — updated `fmtDate()` helper
- `server/src/services/email.service.ts` — updated date formatting in invoice email

### 5c. Logo Not Showing on Public Invoice View — FIXED

**Root cause:** The `viewByToken` endpoint returned raw branding data from the database (which contains `logo_file_path` — a Supabase storage key), but never generated the signed URL (`logo_url`). The frontend checks for `branding.logo_url`, which was always `undefined`.

**Fix:** Added signed URL generation for the logo in the `viewByToken` method, matching what `getBranding()` already does.

**Files modified:**
- `server/src/services/invoices.service.ts` — `viewByToken()` now generates `logo_url` from `logo_file_path` via `getSignedUrl()`

---

## Role Permissions Summary

| Feature | Admin | Supervisor | Dispatcher | Sales & Dispatcher | Sales Agent | Viewer |
|---------|:-----:|:----------:|:----------:|:-----------------:|:-----------:|:------:|
| Dashboard | Yes | Yes | Yes | Yes | Yes | Yes |
| Truckers | Yes | Yes | Yes | Yes | Yes | Yes |
| Loads | Yes | Yes | Yes | Yes | Yes | Yes |
| People | Yes | Yes | No | No | No | No |
| Commissions (all) | Yes | Yes | No | No | No | No |
| Commissions (own) | Yes | Yes | Yes | Yes | Yes | Yes |
| Create Invoice | Yes | Yes | Yes | Yes | No | No |
| Send/Mark Paid Invoice | Yes | Yes | Yes | Yes | No | No |
| Settings | Yes | Yes | No | No | No | No |
| Audit Log | Yes | Yes | No | No | No | No |
| My Profile | Yes | Yes | Yes | Yes | Yes | Yes |
