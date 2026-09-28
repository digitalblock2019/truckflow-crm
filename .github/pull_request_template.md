<!--
main deploys straight to production — merging is releasing.
Full guidance: docs/reviewing-a-pr.md
-->

## What this changes

<!-- What and why, not a file list. -->

## Database

- [ ] No schema change
- [ ] Schema change — migration file added in `server/scripts/migrations/`
- [ ] Schema change — **mirrored into `TruckFlow_CRM_Schema_v1.5.sql`** (the test DB is built from that file and applies no migrations)
- [ ] Migration has been run in the Supabase SQL editor

> If a migration is needed, run it **before** merging. Code referencing a column production doesn't have will 500 the moment it deploys.

## How to verify after deploy

<!-- Concrete steps. "Tested locally" isn't verification. -->

## Risk

- [ ] Touches existing data (migrations, bulk operations, deletes)
- [ ] Changes customer-facing output (carrier or invoice emails, public pages)
- [ ] Changes permissions or auth
- [ ] None of the above

---

**Merging requires all CI checks green.** Server, Client, and End-to-end.
