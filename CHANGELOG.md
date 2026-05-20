# Changelog

All notable changes to the TruckFlow CRM project.

## [1.2.0] - 2026-05-19

### Added
- **Trucker profile fields**: city, fleet size (`power_units`), truck kinds (multi-select), truck dimensions (L/W/H/max payload) on Add Trucker modal, Detail modal, and Onboarding profile
- **Routes & Availability**: operation type (Local/Regional/OTR), preferred lanes (origin→destination city+state), operating states, avoid states, preferred days. Same UI in all 3 trucker entry points via a single shared component
- **Dispatcher assignment slot**: `assigned_dispatcher_id` separate from `assigned_sales_agent_id`. Detail modal has two dropdowns; same `sales_and_dispatcher` user can fill both
- **"Unassigned (no dispatcher)" tab** on Truckers page
- **Field Mapping preview** on Upload page — shows file column → DB field mapping before import, flags unmatched columns
- **DataGrid jump-to-page pagination**: First / Prev / numbered with ellipses / Next / Last + "Go to" input
- **DataGrid per-page picker**: 20 / 50 / 100 / 250 / 500
- **Per-step backend logging** on `markFullyOnboarded` (UPDATE / status_history / audit_log)
- Per-date changelog file `CHANGELOG_2026-05-19.md` with full detail

### Changed
- **MC# field** strips non-digits on input + backend create + bulk import (so `MC-1234567` and `1234 567` both store as `1234567`)
- **Import column mapper** is now case-insensitive and punctuation-tolerant; aliases for `Phone No.`, `MC/MX/FF #`, `Company Name`, `Physical Address`, `Operating Authority Status`, etc.
- **Phone normalized to digits-only** on bulk import (matches scraper format, fixes dup checks)
- **Mark Fully Onboarded toast** rewritten — fixed-position React portal, inline styles, optimistic update + error toast fallback. Three earlier attempts failed for layout/timing reasons; this one ships.
- **`assertReadyForFullyOnboarded` validator** enforces document completion server-side on BOTH the dedicated endpoint AND the generic update endpoint, so the status dropdown can't bypass the onboarding flow
- **Trucker list columns**: "Agent" replaced by "Sales Agent" + "Dispatcher"
- **`cleanAllData.ts`** re-seeds the 7 `trucker_document_types` after wiping, so a future cleanup doesn't leave the onboarding checklist empty

### Fixed
- Onboarding empty-checklist passed `[].every()` vacuously, trivially enabling Mark Fully Onboarded — now requires `docsArr.length > 0`
- Status dropdown bypass that let an admin flip status to `fully_onboarded` without docs (now blocked server-side with descriptive error)
- Bulk import silently dropped fields when XLSX headers didn't exactly match the dictionary — now tolerant + visible
- `update()` dynamic builder mis-handled `preferred_lanes` JSONB — now JSON.stringify-ed before binding

### Migrations
- `addTruckerOnboardingFields` — city, truck_types, truck_length/width/height_ft, max_payload_lbs
- `addTruckerRoutesAndAvailability` — operation_type, preferred_lanes, operating_states, avoid_states, preferred_days
- `splitDispatcherAssignment` — assigned_sales_agent_id, assigned_dispatcher_id + backfill from legacy `assigned_agent_id` by employee_type

### Pending (deferred)
- PR 3 — drop legacy `assigned_agent_id` column after soak period
- Load-form smart match (filter trucker dropdown by route fit + dispatcher-assigned-to-me)
- "My Truckers" view (sidebar count + filter chip per role)

## [1.1.0] - 2026-03-05

### Added
- **Change Password**: Users can change their password from the Profile page
- **Forgot Password**: Password reset flow via email (Resend integration)
  - Forgot password page with email input
  - Reset password page with token-based validation
  - Secure token generation with 1-hour expiry
- **Email Service**: Resend-based email sending with branded HTML templates
  - Password reset emails
  - Welcome emails with login credentials
- **CRM User Creation on Employee Create**: Admins can optionally create a CRM login account when adding employees
  - CRM email, role, and password fields on the create form
  - Random password generation with copy support
  - Welcome email sent automatically with credentials
- **Reinstate Terminated Employee**: Admins can reinstate terminated employees
  - Reactivates employee status to active
  - Re-enables linked CRM user account
  - Audit log entry for reinstatement

### Changed
- Login page now includes "Forgot password?" link
- Profile page now includes Change Password card
- People page create form includes optional CRM account section
- People page detail modal shows Reinstate button for terminated employees (admin only)

## [1.0.0] - 2026-03-04

### Added
- **Employee Management**: Full CRUD for employees with employment types, pay tracking, and commission configuration
- **Employee Termination**: Terminate employees with reason tracking, CRM user deactivation, and commission threshold closure
- **Employee Documents**: Upload and manage employee documents
- **Trucker Onboarding**: Multi-step onboarding flow with document tracking
- **Fully Onboarded Status**: Mark truckers as fully onboarded after document verification
- **Authentication**: Login, logout, token refresh, and session management
- **Role-Based Access**: Admin, supervisor, agent, dispatcher, and viewer roles
- **Trucker Management**: CRUD, CSV import, batch management
- **Load Management**: Create and track loads with status updates
- **Commission Tracking**: Agent commission calculation and approval workflow
- **Invoice Management**: Create, approve, and track invoices
- **Leave Management**: Submit and approve leave requests
- **Internal Chat**: Real-time messaging between CRM users
- **Audit Logging**: Track all user actions across the system
- **Notifications**: In-app notification system
- **Settings**: System-wide configuration management
- **Bank Details**: Encrypted storage with supervisor reveal flow
