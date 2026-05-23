# Epic: Per-Truck Vehicle Records

Scope locked 2026-05-23. Intended to be picked up later on an `epic/per-truck-vehicles` branch.

## Why

The current trucker record holds a single set of truck specs (`truck_type`, `truck_types`, `truck_length_ft`, `truck_width_ft`, `truck_height_ft`, `max_payload_lbs`, `power_units`). A trucker with mixed equipment — e.g., 3 dry vans + 1 reefer — cannot be captured cleanly, and dispatchers can't enforce a load's equipment requirements against a specific vehicle.

The fix is to model each truck as its own row and let the dispatcher attach a specific truck to a load (optionally, post-dispatch).

## Data model

### New table — `trucker_vehicles`

One row per truck.

```
id              uuid PK
trucker_id      uuid REFERENCES truckers(id) ON DELETE CASCADE
unit_number     text                       -- internal label, e.g. "Truck 7" or "Bob's Reefer"
truck_type      truck_type NOT NULL        -- Dry Van | Reefer | Flatbed | Box Truck | Tanker | Other
length_ft       integer
width_ft        integer
height_ft       integer
max_payload_lbs integer
year            integer
make            text
model           text
vin             text
plate           text
status          vehicle_status NOT NULL DEFAULT 'active'   -- active | out_of_service | retired
notes           text
created_at, updated_at, created_by
```

Plus a new enum `vehicle_status`. Index on `trucker_id`.

### Loads — `load_orders` gains `truck_id`

- `truck_id UUID REFERENCES trucker_vehicles(id)` — **always nullable**.
- Service-level guard: when set, the truck must belong to the load's `trucker_id`.
- No "required for new loads" phase — the dispatcher confirms which truck took the load after the fact.

### Deprecated trucker columns

Kept readable for one release, then dropped: `truck_type`, `truck_types`, `truck_length_ft`, `truck_width_ft`, `truck_height_ft`, `max_payload_lbs`, `power_units`. "Number of Trucks" becomes a `COUNT(*)` from `trucker_vehicles`.

## Backfill (one-shot SQL)

For each existing trucker, create vehicle row(s) derived from current fields:
- If `truck_types` is an array of N kinds AND `power_units > 1` → create one row per (kind, copy of dimensions). Heuristic; dispatch will refine.
- If a single `truck_type` only → create one vehicle with all current specs.
- Set `notes = 'Auto-migrated from legacy trucker columns — verify'` so backfilled rows are visibly provisional in the UI.

## Backend (REST + service)

- `GET /api/truckers/:id/vehicles` — list
- `POST /api/truckers/:id/vehicles` — create
- `PATCH /api/truckers/:id/vehicles/:vid` — update
- `DELETE /api/truckers/:id/vehicles/:vid` — soft-delete (`status='retired'`)
- Extend the loads list query + `GET /api/loads/invoiceable` to JOIN the assigned vehicle and return `truck_unit_number` + `truck_type` for display.
- `LoadsService.create()` accepts optional `truck_id`, validates it belongs to the load's trucker.
- New endpoint or extension to update `truck_id` on an existing load (post-dispatch assignment).

## Frontend

- **Onboarding / Trucker profile**: replace the single "Truck Kinds / Dimensions" block with a **+ Add Truck** repeater. Each card is editable, removable, and shows status. Backfilled rows show an "unverified" tag.
- **Trucker detail modal**: a Trucks section listing each vehicle (kind, length, payload, status), with inline edit + add.
- **Create Load modal**: stays unchanged — no truck picker at create time.
- **Load detail modal**: a "Truck (assign when known)" picker filtered to the load's trucker's vehicles. Show **active + OOS** trucks; **retired** trucks are filtered out entirely. OOS trucks render with a "⚠ Out of service" tag in the option label.
- **Truckers list**: replace the single-cell truck info with a count (e.g. "3 trucks · DV, RF").

## Suggested execution order on `epic/per-truck-vehicles`

1. Schema + backfill SQL — run on Supabase, verify with an inspection query. No code yet.
2. Backend vehicles CRUD + JOIN `truck_id` in the load list / invoiceable queries.
3. Trucker onboarding/detail UI — "+ Add Truck" repeater, vehicle section in the detail modal.
4. Load detail modal — Truck picker (optional, post-dispatch). Filter to active + OOS; OOS shows warning; retired filtered out.
5. Drop the legacy trucker columns after a release of dual-read stability.

## Decisions locked

- `truck_id` on loads is **always optional**, treated as a post-dispatch detail. No "required for new loads" rollout phase.
- OOS trucks stay **selectable with a "⚠ Out of service" tag**. Retired trucks are filtered out entirely.
- VIN, plate, year, make, model are all **optional** on `trucker_vehicles`. Don't gate v1 on them.
- **No trailers table** — one trailer per truck, trailer dimensions live directly on the `trucker_vehicles` row. Revisit only if a truck later pulls multiple trailers.

## Risks

- Backfill is heuristic — small fleets are fine; larger fleets will need manual verification (the "unverified" tag handles this).
- Schema drift between v1.5 schema file and live DB will widen — keep a running list of ALTERs in `server/scripts/`.
- Onboarding form UX needs care so adding 5 trucks doesn't make the page hostile (consider collapsing each truck card by default after the first).
