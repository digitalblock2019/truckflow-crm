# TruckFlow CRM — Changes Made on May 19, 2026

A heavy day. Three new schema migrations, two new shared components, four
significant UX upgrades, plus a long-running toast bug finally killed.

---

## 1. Trucker Profile Fields (city / fleet size / truck kinds / dimensions)

**What changed:** Added structured profile data to truckers beyond the bare
FMCSA fields. Shows on the Add Trucker modal, Trucker Detail modal, and the
Onboarding profile section.

**New columns on `truckers`:** `city`, `truck_types TEXT[]`, `truck_length_ft`,
`truck_width_ft`, `truck_height_ft`, `max_payload_lbs` (legacy `truck_type TEXT`
kept for back-compat with old single-value records).

**Migration:** `npm run db:migrate:trucker-onboarding` (or paste the equivalent
ALTER TABLEs in Supabase SQL Editor).

---

## 2. Routes & Availability (NEW feature)

**What changed:** Each trucker can now declare:
- **Operation Type** — Local / Regional / OTR
- **Preferred Lanes** — repeating (Origin City + State → Destination City + State)
- **Operating States** — multi-select chips, all 50 US states
- **Avoid States** — multi-select chips for the hard "no" list (red)
- **Preferred Days** — Mon-Sun chips

**Where:** Add Trucker modal, Trucker Detail modal, Onboarding page profile
section — same UI in all three via a single shared component
`client/src/components/features/RoutesAndAvailabilityFields.tsx`. The component
exposes companion helpers (`routesValueFromTrucker`, `routesEqual`,
`serializeRoutes`) so parent forms only deal with value/onChange.

**New columns on `truckers`:** `operation_type TEXT`, `preferred_lanes JSONB`,
`operating_states TEXT[]`, `avoid_states TEXT[]`, `preferred_days TEXT[]`.

**Migration:** `npm run db:migrate:trucker-routes`.

**Backend note:** The dynamic `update()` builder now JSON.stringify-s
`preferred_lanes` so node-postgres binds it as JSONB and not as an array.

---

## 3. Dispatcher Assignment Split (BREAKING SHAPE CHANGE)

**What changed:** `assigned_agent_id` was a single slot serving both sales and
dispatch. Split into two real slots so a trucker can have a sales agent AND a
dispatcher independently. A `sales_and_dispatcher` user can occupy both.

**New columns on `truckers`:**
- `assigned_sales_agent_id UUID REFERENCES employees(id)`
- `assigned_dispatcher_id  UUID REFERENCES employees(id)`

**Backfill rule** (from legacy `assigned_agent_id` based on employee type):
- everyone EXCEPT pure dispatchers → `assigned_sales_agent_id`
- pure dispatchers → `assigned_dispatcher_id`

Legacy `assigned_agent_id` is **kept and mirrored** for now. PR 3 will drop it
after a soak period.

**Migration:** `npm run db:migrate:dispatcher-split` (or the equivalent SQL
in Supabase Editor).

### Frontend changes

- **Trucker Detail modal:** single "Assign Agent" dropdown replaced with two
  separate dropdowns (Sales Agent + Dispatcher). Each lists the appropriate
  union (sales_agent ∪ sales_and_dispatcher for sales; dispatcher ∪
  sales_and_dispatcher for dispatcher). `Save Assignments` is a single click.
- **Trucker list:** "Agent" column replaced with "Sales Agent" + "Dispatcher".
- **New tab:** "Unassigned (no dispatcher)" — filters to
  `assigned_dispatcher_id IS NULL` regardless of status.

### Backend changes

- `list()` joins both new slots, returns `sales_agent_name` + `dispatcher_name`.
- New filters: `assigned_sales_agent_to`, `assigned_dispatcher_to`,
  `unassigned_sales_agent`, `unassigned_dispatcher`.
- `create()` accepts both new fields; seeds a commission threshold per distinct
  assignee with `ON CONFLICT DO NOTHING` so dual-role users in both slots don't
  trip the unique constraint.
- `update()` auto-assigns the acting user to the sales slot on first
  status-change (and mirrors to the legacy column for back-compat).
- Newly-assigned employees get a "Trucker assigned to you" notification — fires
  per slot but de-duped if the same user fills both.

---

## 4. MC# Digits-Only Normalization

**What changed:** Users were typing `MC-8309847` and `mc 8309847` into the MC#
field, which then never matched scraper-format `8309847`. Now normalized
everywhere.

- **Add Trucker form:** input strips non-digits on every keystroke
  (`inputMode="numeric"`, placeholder shows the right format).
- **Backend `create()`:** strips non-digits from `mc_number` and `dot_number`,
  rejects with 400 if the cleaned MC# is empty.
- **Backend `bulkImport()`:** same per-row normalization; rows with no digits
  go to the `errored` count instead of failing the whole batch.

---

## 5. Import — Header Tolerance + Field Mapping Preview

**What changed:** The old column mapper was an exact-match dictionary, so XLSX
exports with slightly different headers (`Phone No.`, `MC/MX/FF #`,
`Company Name`, `Physical Address`, `Operating Authority Status`) silently
mapped to nothing and rows landed with blank fields.

- **Tolerant matching:** headers are lowercased and stripped of non-alphanumerics
  before lookup. `Phone`, `Phone No.`, `phone_number`, `Phone#`, `Mobile` all
  route to `phone`. Same alias treatment for every common FMCSA-style header.
- **Field Mapping preview card:** appears between the Preview header and the
  row preview after a file is selected. Shows every file column → DB field
  with an arrow. Unmatched columns show `(ignored)` in gray italic.
- **Loud warning:** red banner if `mc_number` didn't map to any column (since
  that's a hard-stop — every row would fail without it).
- **Phone normalization on import:** values stripped to digits-only on the way
  in (matches scraper format and lines up dup checks).

---

## 6. DataGrid — Jump-to-Page Pagination

**What changed:** Pager only had Prev/Next, painful for the new Unassigned tab
(2000+ rows = 100+ pages). Now every list using DataGrid (Truckers, Loads,
Commissions, Invoices, People, etc.) inherits:

- `«` First / `Prev` / numbered page list with ellipses / `Next` / `»` Last
- A "Go to" number input — type any page number, press Enter

Page-number list collapses for large counts (e.g. `1 … 49 50 51 … 102`) so the
bar stays single-line.

---

## 7. DataGrid — Per-Page Picker (20 / 50 / 100 / 250 / 500)

**What changed:** Bulk-delete from the UI is gated by visible page size, so
wiping a few thousand records 20 at a time was painful. DataGrid footer now has
a "Per page" dropdown.

- Pages that opt in by passing `pageSize` + `onPageSizeChange` get the picker.
- Wired into the Truckers page; changing size resets to page 1 and clears the
  selection (since visible rows change).

---

## 8. Onboarding — Document Enforcement & Toast Reliability

### Server-side `fully_onboarded` guard

The Mark Fully Onboarded button was UI-gated, but the Truckers-page status
dropdown could `PATCH /api/truckers/:id` directly with
`status_system='fully_onboarded'` and bypass the check.

`TruckersService.assertReadyForFullyOnboarded(id)` now enforces it server-side
on **both** the dedicated `markFullyOnboarded()` endpoint and on any status
transition to `fully_onboarded` via the generic `update()` endpoint. Throws a
clear 400 with the missing document labels.

### Cleanup re-seed

`scripts/cleanAllData.ts` deleted `trucker_document_types` but never re-seeded
it. Empty type list → empty checklist → `[].every()` is vacuously true → button
trivially enabled. Cleanup now re-seeds the 7 doc types (with
`ON CONFLICT DO NOTHING` so it's idempotent).

### Mark Fully Onboarded toast (finally working)

Three earlier toast attempts failed for different reasons (color opacity not
defined, query-invalidation timing eating the success callback, container with
`transform` hijacking `position:fixed`). Final fix combines:
- **Optimistic update** — toast set immediately on click, not from `isSuccess`
- **Error-toast fallback** — replaces success with red toast carrying the
  server's error message verbatim
- **React portal to `document.body`** — escapes any ancestor layout/transform
- **All-inline styles** — `#16a34a` color, white card, `z-index: 2147483647`
- **Per-step backend logging** — `markFullyOnboarded` now logs which of UPDATE
  / status_history insert / audit_log insert failed. Non-fatal post-UPDATE
  inserts are swallowed (status flip stays) so the request doesn't 500 after
  the data is already committed.

---

## 9. Backend doc-completion validator — robust to enum drift

The first version of `assertReadyForFullyOnboarded` filtered required doc types
with a SQL clause like `condition_flag = 'uses_factoring' AND $1::boolean = TRUE`.
That 500'd on some node-postgres setups when the boolean was already a JS
boolean. Rewrote to pull the full type list and filter in JS (matches the same
logic getChecklist uses for the UI).

---

## 10. Files Added

- `client/src/components/features/RoutesAndAvailabilityFields.tsx` — shared routes UI
- `server/scripts/addTruckerOnboardingFields.ts` — migration for city/dimensions/etc.
- `server/scripts/addTruckerRoutesAndAvailability.ts` — migration for routes columns
- `server/scripts/splitDispatcherAssignment.ts` — migration for dispatcher split + backfill
- `scripts/convert-trucker-xlsx.js` — one-off file converter for FMCSA-style XLSX exports
- `scripts/generate-feature-test-matrix.js` — generates a 106-scenario test matrix
- `CHANGELOG_2026-05-19.md` — this file

## Files Modified (major)

- `TruckFlow_CRM_Schema_v1.5.sql` — new columns on truckers
- `client/src/types/index.ts` — Trucker type extended (new fields), PreferredLane type added
- `client/src/app/(dashboard)/truckers/page.tsx` — Add modal, Detail modal, Unassigned tab, dispatcher dropdowns, MC# input filter, columns
- `client/src/app/(dashboard)/onboarding/page.tsx` — profile section, routes (via shared component), portal toast
- `client/src/app/(dashboard)/upload/page.tsx` — tolerant header mapper + Field Mapping preview
- `client/src/components/ui/DataGrid.tsx` — jump-to-page pager + per-page picker
- `server/src/services/truckers.service.ts` — assertReadyForFullyOnboarded, create() expansion, dispatcher-split filters/joins, MC# strip, JSONB-safe update
- `server/src/controllers/truckers.controller.ts` — new query-param pass-throughs
- `server/scripts/cleanAllData.ts` — re-seed doc types after wipe

## Migrations applied to Supabase

- `addTruckerOnboardingFields` (city, truck_types, dimensions)
- `addTruckerRoutesAndAvailability` (operation_type, preferred_lanes, operating_states, avoid_states, preferred_days)
- `splitDispatcherAssignment` (assigned_sales_agent_id, assigned_dispatcher_id + backfill)
