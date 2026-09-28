# Reviewing a pull request

`main` deploys straight to production — Vercel and Render both auto-deploy on push, with no UAT in between. A merge is a release. This is the only gate.

## The rule

**Do not merge until every CI check is green.** No exceptions for "it's only a small change" — the three bugs found on 2026-09-28 (every API error message being discarded, a wrong password silently reloading the login page, and a schema file that couldn't build a working database) were all invisible to code review and all caught by tests.

## What CI runs

`.github/workflows/ci.yml`, on every PR targeting `main`:

| Check | Covers |
|---|---|
| **Server — typecheck, unit, integration** | `tsc --noEmit`, 78 unit tests, 23 integration tests against a real Postgres |
| **Client — typecheck and build** | `tsc --noEmit` and a production `next build` |
| **End-to-end — API and UI** | 18 API tests against the running server, 19 Playwright UI tests in Chromium |

A red E2E job uploads screenshots, the Playwright report, and both server logs as artifacts — start there rather than re-running locally.

## Before approving

**Does it need a database migration?**
If the PR adds a column, table, or enum value, check three things:
1. A migration file exists in `server/scripts/migrations/`.
2. **The same change is mirrored into `TruckFlow_CRM_Schema_v1.5.sql`.** `runSchema.ts` builds the test database from that file and applies no migrations, so anything missing from it is untestable — and a rebuild from it produces a broken database. This is exactly how the auth columns went missing.
3. The PR description says the migration must run in the Supabase SQL editor **before** merge. Code that references a column the production database doesn't have will 500 the moment it deploys.

**Is the new behaviour actually tested?**
A rule enforced only in the UI isn't enforced. If a PR adds a server-side rule, look for a test that calls the endpoint directly — a disabled button proves nothing about what happens when someone holds a token and calls the API themselves.

**What happens to existing data?**
New non-null columns, changed defaults, anything touching status enums. There are thousands of live carriers; a migration that works on an empty test database can still be wrong against real rows.

**Does it change something customer-facing?**
Carrier and invoice emails must not say "TruckFlow" anywhere — that's the internal tool name. Internal emails (password reset, welcome) should. See `docs/epic-truckers-portal.md` for the branding split.

**Is anything destructive?**
Bulk deletes, data wipes, anything touching `cleanAllData.ts`. That script once destroyed chat history because it treated real business records as test data.

## Before merging

- [ ] All three CI checks green
- [ ] Migration run in Supabase, if the PR needs one
- [ ] PR description says what to verify by hand after deploy
- [ ] You understand what happens if this is wrong, and how to undo it

## If it goes wrong after merge

Rollback is the safety net, not a UAT environment:
- **Vercel** — Rollback to previous deployment, on the dashboard
- **Render** — Rollback on deploy history
- **Git** — `git revert <merge-commit>` and push

Reverting code does **not** undo a migration. If the PR changed the schema, work out the data implications before reverting.

## Manual verification

Automated tests cover mechanics, not whether a feature is genuinely usable. Two living checklists track that:

- **Lead-tracking release** — the mandatory comments, sleeping leads and sheet-import work
- **Product walkthrough** — the whole CRM, module by module, with per-person attribution

Both record pass/fail and remember who checked what. Ask Muhammad for the links.
