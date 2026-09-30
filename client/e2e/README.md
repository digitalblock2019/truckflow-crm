# End-to-end tests

Two Playwright projects:

| Project | Target | What it covers |
|---|---|---|
| `api` | `http://localhost:3000` | Server-enforced rules — validation, permissions, data written. No browser. |
| `ui` | `http://localhost:3001` | The Next.js app in Chromium. |

API-level tests exist because a disabled button proves nothing: anything holding a
token can call the API directly, so rules like the status-comment requirement are
asserted against the endpoint, not just the form.

## These tests write data — never point them at production

They create and delete truckers, and run imports. Run them against the Dockerised
test database only.

```bash
# 1. Test DB (Postgres on :5433, seeded from TruckFlow_CRM_Schema_v1.5.sql)
cd server && npm run test:db:up

# 2. Seed the schema + test users into it
npx jest --testPathPatterns=integration --runInBand   # globalSetup builds the schema

# 3. Backend against the test DB
cd server && NODE_ENV=test npx dotenv -e .env.test -- npm run dev

# 4. Frontend against that backend
cd client && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev
```

Then, from `client/`:

```bash
npx playwright test --project=api    # fast, no browser
npx playwright test --project=ui
npx playwright test                  # both
```

Tear down with `cd server && npm run test:db:down`.

## Login — and why the account looks odd

Both suites sign in as **`autotest@truckflow.invalid`** / `Autotest123!`, seeded
by `server/src/__tests__/globalSetup.ts`.

`.invalid` is reserved by RFC 2606 and can never be a real address, so this
account exists *only* in the local test database. If a run is ever accidentally
pointed at production, login simply fails and the suite stops — rather than
filling live data with test carriers. Don't "fix" it to a real-looking address.

There's a second layer: `globalSetup` refuses to run at all unless
`DATABASE_URL` points at localhost. It truncates tables and deletes users, so
one stale shell with the wrong env would otherwise be catastrophic.

## Gotcha: the schema file is the test DB

`runSchema.ts` builds the test database from `TruckFlow_CRM_Schema_v1.5.sql` and
does **not** apply anything in `server/scripts/migrations/`. So a column or enum
value that only exists in a migration is invisible to these tests, and they'll
fail in ways that look like app bugs.

When you add a migration, mirror the change into the schema file too. As of
2026-09-27 the file was reconciled against production — seven `trucker_status`
enum values and `truckers.updated_by` were missing.

## MC numbers

`uniqueMc()` in `helpers.ts` mints a fresh MC# per test. MC numbers are unique
and the importer normalises them to digits-only, so sharing fixtures across
tests causes collisions on re-runs when a DB wasn't torn down.
