# Epic: Truckers Portal

Scope locked 2026-09-04. Intended to be picked up later on an `epic/truckers-portal` branch. This doc is the source of truth if a session resumes cold — read this before re-deriving anything.

## Why

Today truckers only touch TruckFlow through the one-shot self-onboarding link. After that, everything is phone/email — no way for a trucker to see their own load history, check payment status, or know what's expected of them without calling in. A logged-in portal turns TruckFlow from "we call and email truckers" into something they actively use, and it can carry a loyalty program that gives carriers a reason to stay exclusive to us instead of shopping loads elsewhere.

## Locked decisions

- **Separate auth entirely.** New `trucker_portal_users` table + its own login/JWT, NOT folded into the existing `users` table (which is role-gated for internal admin/sales/dispatcher CRM access). Mixing the two risks an accidental privilege bug between "internal staff" and "external carrier" — kept structurally impossible instead of policed by role checks.
- **Subdomain: `portal.truckflowcrm.com`.** Own cookie/session/CORS boundary, fully separate from the internal CRM app at `www.truckflowcrm.com` and from the API at `api.truckflowcrm.com`. If either surface has an auth bug, it can't leak into the other.
- **Invite-only, no open signup.** A trucker cannot land on a public "sign up" page and create an account. Portal access is granted only once they've taken at least one load with us — see Access model below. This is a deliberate control gate, not a v1-scope-cut; open self-signup is not planned.
- **Commission visibility is fine as-is.** Truckers already know our commission rate — they're the ones paying it. No need to hide "dispatch commission given" on their own load history.
- **Notification channels for v1: email (Resend) + in-app bell.** SMS/WhatsApp deferred — see Notifications section.

## Access model

1. Self-onboarding (already built, Phase A) gets a trucker into the system with docs, MC#, etc. — this stays exactly as-is, no changes.
2. Portal access is a **separate invite**, sent once the trucker actually takes a load with us (not automatically on onboarding-submit). Reasoning: encourages actually working with us before handing over portal credentials; the invite email itself becomes a pitch — highlight what they get (load history, new-load visibility, earnings, first-priority load access, loyalty gift cards) rather than a bare "set your password" link.
3. Invite email → tokenized link (same `link_token` pattern used elsewhere, e.g. `document_email_forwards`) → set-password screen → lands in the portal.
4. **First-login / not-yet-fully-onboarded truckers**: if they land in the portal before their onboarding is complete (missing required docs, etc.), show the onboarding screen first — reuse the existing self-onboarding form/doc-upload UI, don't rebuild it. Optional docs stay skippable, revisitable later (existing "provide later" behavior carries over).
5. **Forgot password**: standard reset-link flow, mirrors the internal CRM's existing password-reset email pattern (Resend, already wired).

## Portal features

### Dashboard
Key stats: total loads delivered with us, total load amount, total commission paid to us, and (once built) progress toward the next loyalty tier. This is the "why keep working with us" screen.

### Load history
Every past load with: capacity, source → destination route, pickup date, delivery date, total amount, commission given. Filterable/sortable, not just a flat list.

### Active/in-progress load — visual stepper, not just notifications
Show a horizontal stage tracker: Assigned → Picked Up → In Transit → Delivered → Invoiced/Paid, each with a timestamp. Pair this with **"why this status"** — if a load or payment is held (e.g. expired COI), show the plain-English reason instead of silence. Notifications fire *when* a stage changes; the stepper shows *where things stand right now* — both needed, not either/or.

### Document expiry nudges — new capability, not yet built anywhere
Checked the schema: `trucker_documents` has no expiry-date column or reminder logic today. This needs, from scratch:
- An expiry-date field captured at upload time (trucker enters it — COI/MC Authority expiry dates are usually known at upload).
- A scheduled reminder job. Reuse the shape of `invoice_reminder_rules` (existing pattern for "nudge before something's due") rather than inventing a new mechanism.
- Surfaces both as a portal banner and a notification.

### Rate confirmation / paperwork download
Let truckers download their own signed rate-con PDF from load history instead of chasing email. **Needs verification**: check whether rate-con PDF generation already exists on the load/invoice side before scoping this as new work — not confirmed either way yet.

### Profile section
Company details editable by the trucker (subset of fields — TBD which are trucker-editable vs. admin-only), profile picture upload, marketing opt-in/opt-out toggle.

### Notifications
Email + in-app bell for v1. WhatsApp/SMS explicitly deferred — **not "easy," don't undersell it**: WhatsApp needs Meta Business verification (days-long lead time) plus a BSP (Twilio, 360dialog, etc.), comparable-or-harder effort than SMS. Twilio can do both SMS and WhatsApp under one integration, so when there's bandwidth, evaluate Twilio for both together rather than picking one now and redoing later.

### Referral program (rough shape, not final numbers)
- Reward the **referrer**, triggered when the **referred trucker's first load payment clears** (not on signup) — ties the reward to real revenue and avoids gaming.
- Reward tiered by that first load's size: rough shape $25 / $50 / $100.
- Shares the same "≤10% of commission earned" budget ceiling as the loyalty program below (one combined cap, not two separate uncapped programs).

### Loyalty gift-card program (rough shape, later feature — not v1)
- Cumulative load-value tiers, e.g. $25k → $100, $50k → $300, $75k → $500, $100k → $1000 (illustrative only, not final).
- Hard constraint: **total rewards paid must not exceed 10% of total commission earned** on that trucker's loads (commission is ~7% of load value today). The illustrative tiers above scale slightly faster than linear (100→300 is 3x reward for 2x volume) — needs to be checked against real commission-per-load numbers before locking any tier, not just round load-value thresholds.
- Explicitly a "later" feature — v1 of the portal does not need to ship this, but the dashboard's stats (total delivered, total commission) should be built in a way that a future tier-progress bar can slot in without a rework.

## Data model additions needed (not exhaustive, refine when building)
- `trucker_portal_users` — separate from `users`. id, trucker_id (FK), email, password_hash, created_at, last_login_at, marketing_opt_in.
- `trucker_document_expiry` field(s) on `trucker_documents` (or a new small table if multiple expiry-relevant fields end up needed) + a reminder-rules table shaped like `invoice_reminder_rules`.
- Referral: needs a referrer↔referred link somewhere (either a column on `truckers` or a small `trucker_referrals` table) plus a rewards/ledger table shared with the loyalty program.
- Loyalty tier state: some way to track cumulative qualifying load value and rewards already paid, per trucker.

## Open questions (need answers before/while building, not blocking the spec)
- Which profile fields are trucker-editable vs. admin-only?
- Does rate-con PDF generation already exist to hook into, or does the portal need it built?
- Exact referral/loyalty tier numbers — deferred pending real commission-per-load data.
- Portal session/JWT lifetime and refresh pattern — mirror internal CRM's access/refresh token pattern, or different given it's a different trust boundary?

## Suggested build order (not committed, just a reasonable default)
1. `trucker_portal_users` + auth (login, set-password, forgot-password) + subdomain scaffold.
2. Invite flow (tokenized link off an existing trucker record) + first-login onboarding-gate check.
3. Dashboard + load history + active-load stepper (read-only surfaces first — lowest risk, highest immediate value).
4. Document expiry field + reminder job.
5. Profile section (details, picture, marketing opt-in).
6. Notifications (email + in-app) wired to the above.
7. Rate-con download (pending the "does it already exist" check).
8. Referral program.
9. Loyalty gift-card program (explicitly last — "later feature" per the original ask).
