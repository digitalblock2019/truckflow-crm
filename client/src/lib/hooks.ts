"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth";
import type {
  User,
  Trucker,
  Load,
  LoadDocument,
  Commission,
  CommissionSummary,
  Employee,
  Invoice,
  InvoiceClient,
  Conversation,
  ChatMessage,
  AuditLogEntry,
  Setting,
  LeaveRequest,
  TruckerDocument,
  Notification,
  PaginatedResponse,
  Shipper,
} from "@/types";

// Auth
export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const data = await apiFetch<{ user: User; access_token: string; refresh_token: string }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify(creds) }
      );
      return data;
    },
    onSuccess: (data) => {
      setAuth(data.user, { access_token: data.access_token, refresh_token: data.refresh_token });
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/auth/me"),
    retry: false,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (data: { full_name: string }) =>
      apiFetch<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["me"] });
      // Update local auth store so header/sidebar reflect new name immediately
      const tokens = useAuthStore.getState().tokens;
      if (tokens) setAuth(updated, tokens);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token: string; new_password: string }) =>
      apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
  });
}

// Truckers
export function useTruckers(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["truckers", params],
    queryFn: () => apiFetch<PaginatedResponse<Trucker>>(`/api/truckers?${qs}`),
  });
}

export function useCreateTrucker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Trucker>) =>
      apiFetch<Trucker>("/api/truckers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["truckers"] }),
  });
}

export function useUpdateTrucker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Trucker> & { id: string }) =>
      apiFetch<Trucker>(`/api/truckers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["truckers"] });
      qc.invalidateQueries({ queryKey: ["trucker-documents"] });
    },
  });
}

export function useDeleteTrucker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/truckers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["truckers"] }); },
  });
}

export function useBulkDeleteTruckers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/truckers/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["truckers"] }); },
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      apiFetch(`/api/truckers/bulk-delete`, { method: "POST", body: JSON.stringify({ batch_id: batchId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["truckers"] });
      qc.invalidateQueries({ queryKey: ["trucker-batches"] });
    },
  });
}

export function useTruckerBatches() {
  return useQuery({
    queryKey: ["trucker-batches"],
    queryFn: () => apiFetch<Array<{
      id: string; filename: string; rows_added: number; rows_skipped: number;
      rows_errored: number; uploaded_by_name: string; uploaded_at: string;
    }>>("/api/truckers/batches"),
  });
}

export function useImportTruckers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, filename }: { rows: Record<string, string>[]; filename?: string }) =>
      apiFetch("/api/truckers/import", { method: "POST", body: JSON.stringify({ rows, filename }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["truckers"] });
      qc.invalidateQueries({ queryKey: ["trucker-batches"] });
    },
  });
}

export function useInitiateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/truckers/${id}/initiate-onboarding`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["truckers"] }),
  });
}

export function useMarkFullyOnboarded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/truckers/${id}/fully-onboarded`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["truckers"] });
      qc.invalidateQueries({ queryKey: ["trucker-documents"] });
    },
  });
}

// Trucker Documents
export function useTruckerDocuments(truckerId: string) {
  return useQuery({
    queryKey: ["trucker-documents", truckerId],
    queryFn: () => apiFetch<TruckerDocument[]>(`/api/truckers/${truckerId}/documents`),
    enabled: !!truckerId,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ truckerId, typeSlug, file }: { truckerId: string; typeSlug: string; file: File }) => {
      const token = useAuthStore.getState().tokens?.access_token;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/truckers/${truckerId}/documents/${typeSlug}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["trucker-documents", vars.truckerId] }),
  });
}

// Employees
export function useEmployees(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () => apiFetch<PaginatedResponse<Employee>>(`/api/employees?${qs}`),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Employee>) =>
      apiFetch<Employee>("/api/employees", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useSalarySlips(year?: number) {
  const qs = year ? `?year=${year}` : "";
  return useQuery({
    queryKey: ["salary-slips", year],
    queryFn: () =>
      apiFetch<Array<{
        month: string;
        base_salary_pkr_paisa: number;
        total_commission_cents: number;
        total_commission_pkr_paisa: number;
        load_count: number;
      }>>(`/api/employees/me/salary-slips${qs}`),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Employee> & { id: string }) =>
      apiFetch<Employee>(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateCrmAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; crm_email?: string; crm_role?: string }) =>
      apiFetch<Employee>(`/api/employees/${id}/crm`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/employees/${id}/reset-password`, { method: "POST" }),
  });
}

export function useTerminateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/employees/${id}/terminate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useReinstateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/employees/${id}/reinstate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// Loads
export function useLoads(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["loads", params],
    queryFn: () => apiFetch<PaginatedResponse<Load>>(`/api/loads?${qs}`),
  });
}

export function useCreateLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Load>) =>
      apiFetch<Load>("/api/loads", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loads"] }),
  });
}

export function useUpdateLoadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/loads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loads"] }),
  });
}

// Load Documents
export function useLoadDocuments(loadId: string) {
  return useQuery({
    queryKey: ["load-documents", loadId],
    queryFn: () => apiFetch<LoadDocument[]>(`/api/loads/${loadId}/documents`),
    enabled: !!loadId,
  });
}

export function useUploadLoadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ loadId, docType, file }: { loadId: string; docType: string; file: File }) => {
      const token = useAuthStore.getState().tokens?.access_token;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/loads/${loadId}/documents/${docType}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["load-documents", vars.loadId] });
    },
  });
}

// Commissions
export function useCommissions(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["commissions", params],
    queryFn: () => apiFetch<PaginatedResponse<Commission>>(`/api/commissions?${qs}`),
  });
}

export function useCommissionSummary(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery({
    queryKey: ["commission-summary", month],
    queryFn: () => apiFetch<CommissionSummary>(`/api/commissions/summary${qs}`),
  });
}

export function useUpdateCommissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/commissions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions"] });
      qc.invalidateQueries({ queryKey: ["commission-summary"] });
    },
  });
}

// Invoices
export function useInvoices(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: () => apiFetch<PaginatedResponse<Invoice>>(`/api/invoice?${qs}`),
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<Invoice>("/api/invoice", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useInvoiceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: Record<string, unknown> }) =>
      apiFetch(`/api/invoice/${id}/${action}`, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useInvoiceClients(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["invoice-clients", params],
    queryFn: () => apiFetch<PaginatedResponse<InvoiceClient>>(`/api/invoice/clients?${qs}`),
  });
}

// Shippers
export function useShippers(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["shippers", params],
    queryFn: () => apiFetch<PaginatedResponse<Shipper>>(`/api/shippers?${qs}`),
  });
}

// Chat
export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<Conversation[]>("/api/chat/conversations"),
  });
}

export function useMessages(conversationId: string, cursor?: string) {
  const qs = cursor ? `?cursor=${cursor}` : "";
  return useQuery({
    queryKey: ["messages", conversationId, cursor],
    queryFn: () => apiFetch<{ messages: ChatMessage[]; nextCursor: string | null }>(`/api/chat/conversations/${conversationId}/messages${qs}`),
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, content, reply_to_id }: { conversationId: string; content: string; reply_to_id?: string }) =>
      apiFetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, reply_to_id }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: string; name?: string; participant_ids?: string[] }) =>
      apiFetch<Conversation>("/api/chat/conversations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

// Audit Log
export function useAuditLog(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["audit-log", params],
    queryFn: () => apiFetch<PaginatedResponse<AuditLogEntry>>(`/api/audit-log?${qs}`),
  });
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<Setting[]>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

// Leave
export function useLeaveRequests(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return useQuery({
    queryKey: ["leave", params],
    queryFn: () => apiFetch<PaginatedResponse<LeaveRequest>>(`/api/leave?${qs}`),
  });
}

export function useSubmitLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { leave_type: string; start_date: string; end_date: string; reason: string }) =>
      apiFetch<LeaveRequest>("/api/leave", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave"] }),
  });
}

export function useLeaveDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: string; notes?: string }) =>
      apiFetch(`/api/leave/${id}/decision`, { method: "PATCH", body: JSON.stringify({ decision, notes }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave"] }),
  });
}

// Notifications
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<PaginatedResponse<Notification>>("/api/notifications"),
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// Invoice Branding
export function useInvoiceBranding() {
  return useQuery({
    queryKey: ["invoice-branding"],
    queryFn: () => apiFetch<Record<string, unknown>>("/api/invoice/branding"),
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiFetch("/api/invoice/branding", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-branding"] }),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const token = useAuthStore.getState().tokens?.access_token;
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/invoice/branding/logo", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-branding"] }),
  });
}

// Profile Avatar
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const token = useAuthStore.getState().tokens?.access_token;
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/auth/me/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}
