"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import SearchBox from "@/components/ui/SearchBox";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useEmployees, useTerminateEmployee } from "@/lib/hooks";
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

export default function PeoplePage() {
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const { data, isLoading } = useEmployees({ status: tab, search, page, limit: 20 });
  const terminateEmp = useTerminateEmployee();

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

  return (
    <>
      <Topbar title="People" subtitle="Employee directory and management" />
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          onPageChange={setPage}
          onRowClick={(row) => setSelectedEmployee(row as unknown as Employee)}
          toolbar={
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search employees..." />
          }
        />
      </div>

      <Modal
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        title={selectedEmployee?.full_name ?? ""}
        width="520px"
      >
        {selectedEmployee && (
          <div>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-full bg-blue flex items-center justify-center text-xl font-bold text-white">
                {initials(selectedEmployee.full_name)}
              </div>
              <div>
                <div className="text-base font-bold text-navy">{selectedEmployee.full_name}</div>
                <div className="text-[11px] text-txt-light font-mono">{selectedEmployee.job_title ?? employeeTypeLabel(selectedEmployee.employee_type)}</div>
                <Badge color={statusColors[selectedEmployee.employment_status ?? ""] ?? "gray"} className="mt-1">
                  {selectedEmployee.employment_status ?? "—"}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Email</div>
                <div className="mt-0.5 text-txt">{selectedEmployee.crm_email ?? selectedEmployee.personal_email ?? "—"}</div>
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
                <div className="mt-0.5 text-txt">{selectedEmployee.department ?? "—"}</div>
              </div>
            </div>
            {isAdmin && selectedEmployee.employment_status === "active" && (
              <div className="mt-5 pt-4 border-t border-border">
                <Button
                  variant="danger"
                  onClick={() => {
                    terminateEmp.mutate(selectedEmployee.id, {
                      onSuccess: () => setSelectedEmployee(null),
                    });
                  }}
                  disabled={terminateEmp.isPending}
                >
                  {terminateEmp.isPending ? "Terminating..." : "Terminate Employee"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
