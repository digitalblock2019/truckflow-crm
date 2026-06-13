# Loads / Orders — Help

Draft v1. Edit freely.

## What this page is for

This is where you create and track every load (order) your company books. Each load moves through five stages — from Pending to Paid — and this page is where the dispatcher updates that progress and uploads supporting documents along the way.

## How to use it — common workflows

### Create a new load

1. Click **+ New Load**.
2. Pick the **Trucker** (search by MC# or legal name).
3. Fill in the route: **Origin City + State**, **Destination City + State**. You can pick US states or Canadian provinces in the state dropdown.
4. Enter the **Gross Load Amount** in dollars (what the broker is paying for this load).
5. Optionally pick the **Equipment Type** (Dry Van, Reefer, Flatbed, Cargo Van, Sprinter Van, Box Truck, etc.) and **Trailer Length**.
6. Pick the **Sales Agent** and **Dispatcher** if not already filled in.
7. Click **Create Load**.

The form won't close if you click the dimmed background — only the X or Cancel button closes it, so you don't lose half-typed data by accident.

### Move a load forward through the pipeline

A load progresses: **Pending → Dispatched → In Transit → Delivered → Paid**.

Each forward step requires a document:

| Step | Required document |
|---|---|
| Pending → Dispatched | Rate Confirmation |
| Dispatched → In Transit | Bill of Lading (BOL) |
| In Transit → Delivered | Proof of Delivery (POD) |
| Delivered → Paid | (optional: Receipt / Proof of Payment) |

To move a load:

1. Click the load row to open it.
2. Upload the required document for the next stage under **Delivery Stages**.
3. Click **Advance to [Next Stage]**. The button stays disabled until the document is uploaded.

### Revert a load to the previous stage

If you advanced by mistake (e.g. clicked "Advance to Paid" too early):

1. Open the load.
2. Click **Revert to [Previous Stage]**.

The status drops back one step. Commission rows are removed if reverting away from Paid (only if they're still pending — already-approved/paid commissions are left in place).

### Delete a load (admin only)

1. Open the load.
2. Click **Delete Load** at the bottom.
3. Confirm.

Loads with invoices attached or with approved/paid commissions are blocked from deletion — those need to be resolved first.

## What the earnings breakdown means

When you open a load, the **Earnings Breakdown** card shows:

- **Gross** — the full amount the broker is paying ($1,740 in the example).
- **Company commission (8%)** — what the company keeps before paying out reps ($139.20).
  - **− Dispatcher (10%) · Bob Smith** — what the dispatcher earns on this load.
  - **− Sales agent (10%) · Jane Doe — load 2 of 3** — what the sales rep earns, plus where they are in their threshold (e.g. "load 2 of 3" if they earn on the first 3 loads per trucker).
- **Company net** — what the company actually keeps after paying out rep + dispatcher.

If a sales agent isn't assigned to this load (or has used up their threshold), that row is hidden or shows the status.

## What each button does

- **+ New Load** — open the Create Load form.
- **Advance to [Next Stage]** — push the load forward one step (requires the appropriate document).
- **Revert to [Previous Stage]** — drop the load back one step.
- **Upload / Replace** — attach or swap a document for the current stage.
- **Delete Load** — admin only; permanently removes the load and its documents.

## When commissions actually become "earned"

A load's commission rows are only **created** when the load advances to **Payment Received**. Until then the breakdown card shows what each rep would earn — but no commission record exists yet. This way unpaid loads don't inflate the commission totals in reports.
