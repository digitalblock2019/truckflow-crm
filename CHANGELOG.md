# Changelog

All notable changes to the TruckFlow CRM project.

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
