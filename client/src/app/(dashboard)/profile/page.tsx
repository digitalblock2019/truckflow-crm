"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useAuthStore } from "@/lib/auth";
import { useMe, useLeaveRequests, useSubmitLeave, useCommissions } from "@/lib/hooks";
import { initials, fmt } from "@/lib/utils";
import type { Commission, LeaveRequest } from "@/types";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: me } = useMe();
  const { data: leaveData } = useLeaveRequests({});
  const { data: commData } = useCommissions({ limit: 5 });
  const submitLeave = useSubmitLeave();

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "vacation",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const handleLeaveSubmit = () => {
    submitLeave.mutate(leaveForm, {
      onSuccess: () => {
        setShowLeaveForm(false);
        setLeaveForm({ leave_type: "vacation", start_date: "", end_date: "", reason: "" });
      },
    });
  };

  const meAny = me as unknown as Record<string, unknown> | undefined;
  const displayName = (meAny?.full_name as string) ?? user?.full_name ?? "User";
  const displayRole = (meAny?.crm_role as string) ?? (meAny?.role as string) ?? user?.role ?? "";
  const displayEmail = (meAny?.email as string) ?? user?.email ?? "";

  return (
    <>
      <Topbar
        title="My Profile"
        subtitle="Personal information and self-service"
        actions={
          <Button variant="secondary" onClick={() => { logout(); window.location.href = "/login"; }}>
            Sign Out
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <div className="grid grid-cols-[280px_1fr] gap-4">
          <Card className="text-center">
            <div className="w-[72px] h-[72px] rounded-full bg-blue flex items-center justify-center text-2xl font-bold text-white mx-auto mb-3">
              {initials(displayName)}
            </div>
            <div className="text-base font-bold text-navy">{displayName}</div>
            <div className="text-[11px] text-txt-light font-mono mt-1 capitalize">{displayRole}</div>
            <div className="text-xs text-txt-light mt-1">{displayEmail}</div>

            <div className="mt-4 pt-4 border-t border-border text-left space-y-3">
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Employee ID</div>
                <div className="text-[13px] font-semibold text-txt mt-0.5 font-mono">
                  {(me as unknown as Record<string, unknown>)?.employee_number as string ?? user?.employee_id ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Job Title</div>
                <div className="text-[13px] font-semibold text-txt mt-0.5 capitalize">
                  {(me as unknown as Record<string, unknown>)?.job_title as string ?? "—"}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Leave Requests"
                action={
                  <Button size="sm" onClick={() => setShowLeaveForm(!showLeaveForm)}>
                    {showLeaveForm ? "Cancel" : "+ Request Leave"}
                  </Button>
                }
              />
              {showLeaveForm && (
                <div className="border border-border rounded-md p-4 mb-4 bg-surface">
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Leave Type"
                      value={leaveForm.leave_type}
                      onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                      options={[
                        { value: "vacation", label: "Vacation" },
                        { value: "sick", label: "Sick Leave" },
                        { value: "personal", label: "Personal" },
                      ]}
                    />
                    <div />
                    <Input
                      label="Start Date"
                      type="date"
                      value={leaveForm.start_date}
                      onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    />
                    <Input
                      label="End Date"
                      type="date"
                      value={leaveForm.end_date}
                      onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    />
                  </div>
                  <div className="mt-3">
                    <Input
                      label="Reason"
                      value={leaveForm.reason}
                      onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button onClick={handleLeaveSubmit} disabled={submitLeave.isPending}>
                      {submitLeave.isPending ? "Submitting..." : "Submit Request"}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {(leaveData?.data ?? []).length === 0 && (
                  <div className="text-xs text-txt-light py-4 text-center">No leave requests</div>
                )}
                {(leaveData?.data ?? []).map((l: LeaveRequest) => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-[#f0f2f5] last:border-0 text-xs">
                    <div>
                      <span className="font-medium text-txt capitalize">{l.leave_type}</span>
                      <span className="text-txt-light ml-2">
                        {new Date(l.start_date).toLocaleDateString()} — {new Date(l.end_date).toLocaleDateString()}
                      </span>
                    </div>
                    <Badge color={l.status === "approved" ? "green" : l.status === "denied" ? "red" : "orange"}>
                      {l.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Recent Commissions" subtitle="Read-only view" />
              <div className="space-y-2">
                {(commData?.data ?? []).length === 0 && (
                  <div className="text-xs text-txt-light py-4 text-center">No commission records</div>
                )}
                {(commData?.data ?? []).map((c: Commission) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-[#f0f2f5] last:border-0 text-xs">
                    <div>
                      <span className="font-mono">{c.order_number ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{fmt(c.amount_cents)}</span>
                      <Badge color={c.status === "paid" ? "green" : c.status === "approved" ? "blue" : "orange"}>
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
