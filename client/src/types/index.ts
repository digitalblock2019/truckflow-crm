export interface User {
  id: string;
  email: string;
  role: "admin" | "supervisor" | "agent" | "dispatcher" | "viewer";
  full_name: string;
  employee_id?: string;
  is_active?: boolean;
  created_at?: string;
  // From /me endpoint (extended)
  employee_number?: string;
  job_title?: string;
  department?: string;
  employee_type?: string;
  employment_status?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface Employee {
  id: string;
  employee_number: string | null;
  full_name: string;
  personal_email: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  employee_type: "sales_agent" | "dispatcher" | "admin" | string;
  employment_status: "active" | "inactive" | "terminated" | string;
  start_date: string | null;
  termination_date: string | null;
  commission_type: string | null;
  commission_value: string | null;
  crm_email: string | null;
  crm_role: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface Trucker {
  id: string;
  mc_number: string;
  legal_name: string;
  dba_name: string | null;
  dot_number: string | null;
  phone: string | null;
  email: string | null;
  physical_address: string | null;
  state: string | null;
  status_system: string | null;
  truck_type: string | null;
  power_units: number | null;
  driver_count: number | null;
  assigned_agent_id: string | null;
  agent_name: string | null;
  company_commission_pct: string | null;
  onboarding_initiated_at: string | null;
  fully_onboarded_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface Load {
  id: string;
  order_number: string;
  trucker_id: string;
  trucker_name: string | null;
  mc_number: string | null;
  shipper_id: string | null;
  dispatcher_id: string | null;
  dispatcher_name: string | null;
  sales_agent_id: string | null;
  agent_name: string | null;
  load_origin: string | null;
  load_destination: string | null;
  gross_load_amount_cents: number;
  company_gross_cents: number | null;
  company_net_cents: number | null;
  agent_commission_cents: number | null;
  dispatcher_commission_cents: number | null;
  load_status: string;
  exclude_from_commission: boolean;
  exclusion_reason: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface Commission {
  id: string;
  load_order_id: string | null;
  employee_id: string;
  employee_name: string | null;
  employee_type: string | null;
  order_number: string | null;
  amount_cents: number;
  status: string;
  approved_by: string | null;
  paid_by: string | null;
  excluded: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface CommissionSummary {
  total_pending_cents: number;
  total_approved_cents: number;
  total_paid_cents: number;
  total_disputed_cents: number;
  count: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  client_name: string | null;
  recipient_email: string;
  status: "draft" | "sent" | "viewed" | "paid" | "overdue" | "cancelled";
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  due_date: string;
  paid_date: string | null;
  view_token: string | null;
  created_at: string;
  line_items?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface InvoiceClient {
  id: string;
  company_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Shipper {
  id: string;
  company_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: "announcement" | "group" | "direct";
  name: string | null;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  participant_count: number;
  participants?: string[];
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  reply_to_id: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
  description: string | null;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  decision_by: string | null;
  decision_notes: string | null;
  created_at: string;
}

export interface TruckerDocument {
  type_slug: string;
  type_label: string;
  required: boolean;
  uploaded: boolean;
  file_name: string | null;
  file_path: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  summary?: Record<string, unknown>;
}
