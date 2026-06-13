# Truckers — Help

Draft v1. Edit freely.

## What this page is for

This is your main directory of carriers (truckers). Every trucker you've imported, called, or onboarded shows up here. You use this page to:

- See where each trucker is in your sales pipeline (just imported, contacted, interested, ready to onboard, fully onboarded).
- Assign a sales rep and a dispatcher to a trucker.
- Search and filter the list to find specific records.
- Bulk-assign a whole upload batch (e.g. 500 fresh records) to one rep at once.
- Open a trucker to update their status, notes, or documents.

## How to use it — common workflows

### Filter the list to find what you need

- **Tabs (top of page)** — quick filters by status: All / Imported / Called / SMS Sent / Interested / Ready For Onboarding / Fully Onboarded / Not Interested / Unassigned (no sales rep) / Unassigned (no dispatcher).
- **Sales Rep dropdown (in the toolbar)** — show only truckers belonging to a specific rep, or pick "Unassigned (no sales rep)" to see the backlog.
- **Search box** — type an MC number, legal name, DBA, or phone to jump to a specific record.
- **Sales reps see their own truckers by default** — change the dropdown to "All sales reps" to see everything.

### Bulk-assign an upload to a rep (admin/supervisor)

1. Go to **Upload Data** and import a CSV.
2. Click "View this batch" — that opens the truckers list filtered to just this upload.
3. Click the **"Assign Entire Batch (N)"** link in the blue banner at the top.
4. Pick a Sales Agent and/or Dispatcher in the modal and click Apply.
5. Every trucker in that batch is now assigned in one shot.

You can also pick individual rows with the checkboxes and click **"Bulk Assign (N)"** to do partial assignments.

### Update a single trucker

1. Click any row to open the detail modal.
2. Change the **Status** dropdown (e.g. mark "Called" or "Interested") and click Update Status.
3. Set the **Sales Agent** and **Dispatcher** dropdowns and click Save Assignments.
4. Switch to the **Documents** tab to upload onboarding paperwork.
5. Click "Delete Trucker" only if the record is a mistake.

## What each button does

- **+ Add Trucker** — manually create a new trucker record. Use this only if you can't import them via Upload Data.
- **Bulk Assign (N)** — assign a sales rep / dispatcher to the N truckers you've checked off.
- **Delete Selected (N)** — remove the N checked truckers. **This cannot be undone**, so be sure.
- **Assign Entire Batch (N)** — appears only when viewing a single upload; assigns every trucker in that upload to the rep / dispatcher you pick.
- **Row checkbox** — select a row for bulk actions.
- **Header checkbox** — select all rows on the current page.

## What the columns mean

- **MC#** — Motor Carrier number, the FMCSA identifier.
- **Legal Name / DBA** — the carrier's registered name / trade name.
- **State** — where the carrier is based.
- **Status** — where they are in your sales pipeline.
- **Email / Phone** — best contact info on file.
- **Sales Agent / Dispatcher** — who on your team owns this trucker.

## Auto-assign rule

When a sales rep changes a trucker's status (Called, SMS Sent, etc.) and the trucker has no sales rep assigned yet, the system automatically assigns that rep as the trucker's sales agent. This way reps who pick up a "fresh" trucker automatically own it.
