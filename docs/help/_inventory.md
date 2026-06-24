# Help Guide Inventory

Single source of truth for *where* in the app we want a "?" help button and what topic each one covers. When wiring up the UI, walk this list — drafts marked **[drafted]** already have a `.md` file in this folder; everything else needs a draft first.

The "?" button itself is a small icon at the top-right of each page (next to the topbar title) that opens a slide-out panel rendering the relevant markdown.

---

## Pages

| Page | Path | Draft | Notes |
|---|---|---|---|
| Truckers | `/truckers` | **[drafted]** `truckers.md` | Main carrier database; status pipeline |
| Onboarded Truckers | `/truckers` (Onboarded tab) | **[drafted]** `onboarded-truckers.md` | Subset of Truckers — fully onboarded only |
| Onboarding | `/onboarding` | **[drafted]** `onboarding.md` | Document collection flow, required vs optional types |
| Loads / Orders | `/loads` | **[drafted]** `loads.md` | Status pipeline, document requirements, Edit Load lock rules |
| Employee Commissions | `/commissions` | ☐ needs draft | Formula bar (Gross / Carrier / Net / Empl Rate / Empl Comm), This Month vs Lifetime, status flow (pending → approved → paid), 3-load threshold model for sales agents (dispatchers earn forever) |
| Dashboard | `/` | ☐ needs draft | What each widget means (Commission Summary, Load Status, Invoice Overview, Trucker Pipeline, Communications) |
| People | `/people` | ☐ needs draft | Employee types and what they map to as CRM roles; commission_value semantics; how dedupe-by-email works |
| Invoices | `/invoices` | ☐ needs draft | Draft → Sent → Paid lifecycle; overdue rules; what triggers re-send |
| Team Chat | `/chat` | ☐ needs draft | System messages (added/removed/renamed); 15-min edit window; group admin powers; announcements |
| Upload Data | `/upload` | ☐ needs draft | Bulk import flow, supported columns, dedupe rules |
| Audit Log | `/audit` | ☐ needs draft | What gets logged, who can see it, retention |
| Settings | `/settings` | ☐ needs draft | Per-setting explanation, especially `agent_commission_threshold_default` |

## Forms (modal-level help)

These are smaller — a single info paragraph inside the modal, not a full panel.

| Form | Location | Notes |
|---|---|---|
| Add Load | `+ New Load` button on `/loads` | Locked fields explained (trucker, gross/components, commission %); why; how MC duplicate truckers work |
| Add Trucker | `+ Add Trucker` button on `/truckers` | Required fields, MC duplicate prompt → force=true bypass |
| Add Employee | `+ Add Employee` button on `/people` | Employee type → CRM role mapping, duplicate email prevention message |
| Edit Load | Edit Load button on load detail modal | What's editable, what's locked, why (commission engine stability) |

## Future (when shipped)

- **Permanent-delete employee button** (gated to safe-to-delete only) — needs an inline explanation of what "safe" means and what to do when blocked
- **Admin /reports page** (parked) — full guide if/when built
- **Per-truck vehicles** (parked) — full guide if/when built

---

## How to write a draft

Keep it short, user-language, action-oriented. Each draft should answer:

1. **What this page is for** (one sentence)
2. **Common actions** (3-5 bullets — what users do here most)
3. **Things that confuse people** (the actual reason this guide exists — call out the non-obvious rules)
4. **When to ask** (link to support / Slack channel if applicable)

Avoid: feature lists, screenshots that go stale, code, internal jargon ("eligibility_status", "FK constraint"). Prefer: "your sales agent earns commission on the first 3 paid loads of each trucker they bring in."
