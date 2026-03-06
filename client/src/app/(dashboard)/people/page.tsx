"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import SearchBox from "@/components/ui/SearchBox";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useEmployees, useCreateEmployee, useUpdateEmployee, useTerminateEmployee, useReinstateEmployee } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages, initials, employeeTypeLabel } from "@/lib/utils";
import type { Employee } from "@/types";

const statusColors: Record<string, "green" | "red" | "gray"> = {
  active: "green",
  inactive: "gray",
  terminated: "red",
};

const tabs = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "terminated", label: "Terminated" },
];

const employeeTypes = [
  { value: "sales_agent", label: "Sales Rep" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "fixed_salary", label: "Fixed Salary" },
  { value: "contractor", label: "Contractor" },
];

const payTypes = [
  { value: "salary_only", label: "Salary Only" },
  { value: "salary_plus_commission", label: "Salary + Commission" },
  { value: "commission_only", label: "Commission Only" },
  { value: "contractor_rate", label: "Contractor Rate" },
];

const commissionTypes = [
  { value: "", label: "None" },
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat" },
];

const crmRoles = [
  { value: "", label: "No CRM Access" },
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "sales_agent", label: "Sales Agent" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "viewer", label: "Viewer" },
];

const emptyForm = {
  full_name: "",
  personal_email: "",
  phone: "",
  job_title: "",
  department: "",
  employee_type: "sales_agent",
  start_date: "",
  pay_type: "salary_only",
  base_salary_pkr_paisa: "",
  commission_type: "",
  commission_value: "",
  crm_email: "",
  crm_role: "",
  crm_password: "",
};

export default function PeoplePage() {
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editing, setEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());

  const { data, isLoading } = useEmployees({ status: tab, search, page, limit: 20 });
  const createEmp = useCreateEmployee();
  const updateEmp = useUpdateEmployee();
  const terminateEmp = useTerminateEmployee();
  const reinstateEmp = useReinstateEmployee();

  const columns: Column<Employee>[] = [
    {
      key: "full_name",
      header: "Name",
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {initials(r.full_name)}
          </div>
          <span className="font-medium">{r.full_name}</span>
        </div>
      ),
    },
    { key: "crm_email", header: "Email" },
    { key: "employee_type", header: "Type", render: (r) => <Badge color="blue">{employeeTypeLabel(r.employee_type)}</Badge> },
    { key: "employment_status", header: "Status", render: (r) => <Badge color={statusColors[r.employment_status ?? ""] ?? "gray"}>{r.employment_status ?? "—"}</Badge> },
    { key: "start_date", header: "Start Date", render: (r) => r.start_date ? new Date(r.start_date).toLocaleDateString() : "—" },
    { key: "phone", header: "Phone" },
  ];

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pw = '';
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setForm({ ...form, crm_password: pw });
  };

  const handleCreate = () => {
    const payload: Record<string, unknown> = {
      full_name: form.full_name,
      personal_email: form.personal_email || undefined,
      phone: form.phone || undefined,
      job_title: form.job_title || undefined,
      department: form.department || undefined,
      employee_type: form.employee_type,
      start_date: form.start_date || undefined,
      pay_type: form.pay_type,
      base_salary_pkr_paisa: form.base_salary_pkr_paisa ? parseInt(form.base_salary_pkr_paisa) : undefined,
      commission_type: form.commission_type || undefined,
      commission_value: form.commission_value ? parseFloat(form.commission_value) : undefined,
    };
    if (form.crm_email && form.crm_role) {
      payload.crm_email = form.crm_email;
      payload.crm_role = form.crm_role;
      if (form.crm_password) payload.crm_password = form.crm_password;
    }
    createEmp.mutate(
      payload as Partial<Employee>,
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ ...emptyForm });
        },
      }
    );
  };

  const startEdit = () => {
    if (!selectedEmployee) return;
    setForm({
      full_name: selectedEmployee.full_name || "",
      personal_email: (selectedEmployee as any).personal_email || "",
      phone: selectedEmployee.phone || "",
      job_title: (selectedEmployee as any).job_title || "",
      department: (selectedEmployee as any).department || "",
      employee_type: selectedEmployee.employee_type || "sales_agent",
      start_date: selectedEmployee.start_date ? selectedEmployee.start_date.split("T")[0] : "",
      pay_type: (selectedEmployee as any).pay_type || "salary_only",
      base_salary_pkr_paisa: (selectedEmployee as any).base_salary_pkr_paisa?.toString() || "",
      commission_type: selectedEmployee.commission_type || "",
      commission_value: selectedEmployee.commission_value?.toString() || "",
      crm_email: "",
      crm_role: "",
      crm_password: "",
    });
    setEditing(true);
  };

  const handleUpdate = () => {
    if (!selectedEmployee) return;
    const updates: Record<string, unknown> = {};
    if (form.full_name !== selectedEmployee.full_name) updates.full_name = form.full_name;
    if (form.personal_email !== ((selectedEmployee as any).personal_email || "")) updates.personal_email = form.personal_email;
    if (form.phone !== (selectedEmployee.phone || "")) updates.phone = form.phone;
    if (form.job_title !== ((selectedEmployee as any).job_title || "")) updates.job_title = form.job_title;
    if (form.department !== ((selectedEmployee as any).department || "")) updates.department = form.department;
    if (form.employee_type !== selectedEmployee.employee_type) updates.employee_type = form.employee_type;
    if (form.start_date !== (selectedEmployee.start_date ? selectedEmployee.start_date.split("T")[0] : "")) updates.start_date = form.start_date || null;
    if (form.pay_type !== ((selectedEmployee as any).pay_type || "salary_only")) updates.pay_type = form.pay_type;
    const newSalary = form.base_salary_pkr_paisa ? parseInt(form.base_salary_pkr_paisa) : null;
    if (newSalary !== ((selectedEmployee as any).base_salary_pkr_paisa || null)) updates.base_salary_pkr_paisa = newSalary;
    const newCommType = form.commission_type || null;
    if (newCommType !== (selectedEmployee.commission_type || null)) updates.commission_type = newCommType;
    const newCommVal = form.commission_value ? parseFloat(form.commission_value) : null;
    if (newCommVal !== (selectedEmployee.commission_value || null)) updates.commission_value = newCommVal;

    if (Object.keys(updates).length === 0) { setEditing(false); return; }

    updateEmp.mutate(
      { id: selectedEmployee.id, ...updates } as Partial<Employee> & { id: string },
      {
        onSuccess: (updatedEmp) => {
          setEditing(false);
          setSelectedEmployee(updatedEmp);
        },
      }
    );
  };

  const closeDetail = () => {
    setSelectedEmployee(null);
    setEditing(false);
  };

  return (
    <>
      <Topbar
        title="People"
        subtitle="Employee directory and management"
        actions={
          isSup ? <Button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }}>+ Add Employee</Button> : undefined
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          onPageChange={setPage}
          onRowClick={(row) => { setSelectedEmployee(row as unknown as Employee); setEditing(false); }}
          toolbar={
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search employees..." />
          }
        />
      </div>

      {/* Employee Detail / Edit Modal */}
      <Modal
        open={!!selectedEmployee}
        onClose={closeDetail}
        title={editing ? "Edit Employee" : selectedEmployee?.full_name ?? ""}
        width="560px"
      >
        {selectedEmployee && !editing && (
          <div>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-full bg-blue flex items-center justify-center text-xl font-bold text-white">
                {initials(selectedEmployee.full_name)}
              </div>
              <div>
                <div className="text-base font-bold text-navy">{selectedEmployee.full_name}</div>
                <div className="text-[11px] text-txt-light font-mono">{(selectedEmployee as any).job_title ?? employeeTypeLabel(selectedEmployee.employee_type)}</div>
                <Badge color={statusColors[selectedEmployee.employment_status ?? ""] ?? "gray"} className="mt-1">
                  {selectedEmployee.employment_status ?? "—"}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Email</div>
                <div className="mt-0.5 text-txt">{selectedEmployee.crm_email ?? (selectedEmployee as any).personal_email ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Phone</div>
                <div className="mt-0.5 text-txt">{selectedEmployee.phone ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Start Date</div>
                <div className="mt-0.5 text-txt">{selectedEmployee.start_date ? new Date(selectedEmployee.start_date).toLocaleDateString() : "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Department</div>
                <div className="mt-0.5 text-txt">{(selectedEmployee as any).department ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Employee Type</div>
                <div className="mt-0.5 text-txt">{employeeTypeLabel(selectedEmployee.employee_type)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Employee #</div>
                <div className="mt-0.5 text-txt font-mono">{(selectedEmployee as any).employee_number ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Pay Type</div>
                <div className="mt-0.5 text-txt capitalize">{((selectedEmployee as any).pay_type ?? "—").replace(/_/g, " ")}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Commission</div>
                <div className="mt-0.5 text-txt">
                  {selectedEmployee.commission_type
                    ? `${selectedEmployee.commission_value}${selectedEmployee.commission_type === "percentage" ? "%" : " flat"}`
                    : "—"}
                </div>
              </div>
            </div>

            {isSup && (
              <div className="mt-5 pt-4 border-t border-border flex gap-2">
                <Button onClick={startEdit}>Edit Employee</Button>
                {isAdmin && selectedEmployee.employment_status === "active" && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (!confirm(`Terminate ${selectedEmployee.full_name}? This will deactivate their CRM account.`)) return;
                      terminateEmp.mutate(selectedEmployee.id, {
                        onSuccess: () => setSelectedEmployee(null),
                      });
                    }}
                    disabled={terminateEmp.isPending}
                  >
                    {terminateEmp.isPending ? "Terminating..." : "Terminate Employee"}
                  </Button>
                )}
                {isAdmin && selectedEmployee.employment_status === "terminated" && (
                  <Button
                    onClick={() => {
                      if (!confirm(`Reinstate ${selectedEmployee.full_name}? This will reactivate their account.`)) return;
                      reinstateEmp.mutate(selectedEmployee.id, {
                        onSuccess: () => setSelectedEmployee(null),
                      });
                    }}
                    disabled={reinstateEmp.isPending}
                  >
                    {reinstateEmp.isPending ? "Reinstating..." : "Reinstate Employee"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {selectedEmployee && editing && (
          <div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              <Input label="Personal Email" type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} />
              <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Job Title" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              <Input label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              <Select label="Employee Type" value={form.employee_type} onChange={(e) => setForm({ ...form, employee_type: e.target.value })} options={employeeTypes} />
              <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              <Select label="Pay Type" value={form.pay_type} onChange={(e) => setForm({ ...form, pay_type: e.target.value })} options={payTypes} />
              <Input label="Base Salary (paisa)" type="number" value={form.base_salary_pkr_paisa} onChange={(e) => setForm({ ...form, base_salary_pkr_paisa: e.target.value })} />
              <Select label="Commission Type" value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value })} options={commissionTypes} />
              {form.commission_type && (
                <Input label={form.commission_type === "percentage" ? "Commission %" : "Commission Amount"} type="number" step="0.01" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateEmp.isPending}>
                {updateEmp.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Employee Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add New Employee" width="560px">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          <Input label="Personal Email" type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Job Title" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          <Input label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <Select label="Employee Type" value={form.employee_type} onChange={(e) => setForm({ ...form, employee_type: e.target.value })} options={employeeTypes} />
          <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Select label="Pay Type" value={form.pay_type} onChange={(e) => setForm({ ...form, pay_type: e.target.value })} options={payTypes} />
          <Input label="Base Salary (paisa)" type="number" value={form.base_salary_pkr_paisa} onChange={(e) => setForm({ ...form, base_salary_pkr_paisa: e.target.value })} />
          <Select label="Commission Type" value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value })} options={commissionTypes} />
          {form.commission_type && (
            <Input label={form.commission_type === "percentage" ? "Commission %" : "Commission Amount"} type="number" step="0.01" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
          )}
        </div>

        {/* CRM Account Section */}
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-xs font-semibold text-navy mb-3">CRM Account (Optional)</div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="CRM Email" type="email" value={form.crm_email} onChange={(e) => setForm({ ...form, crm_email: e.target.value })} placeholder="user@company.com" />
            <Select label="CRM Role" value={form.crm_role} onChange={(e) => setForm({ ...form, crm_role: e.target.value })} options={crmRoles} />
            {form.crm_email && form.crm_role && (
              <div className="col-span-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input label="Password (auto-generated if empty)" type="text" value={form.crm_password} onChange={(e) => setForm({ ...form, crm_password: e.target.value })} placeholder="Leave empty to auto-generate" />
                  </div>
                  <Button type="button" variant="secondary" onClick={generatePassword} className="shrink-0 mb-[1px]">
                    Generate
                  </Button>
                </div>
                {form.crm_password && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
                    Copy this password now — it will be emailed to the user and cannot be viewed again.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createEmp.isPending || !form.full_name}>
            {createEmp.isPending ? "Creating..." : "Create Employee"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
