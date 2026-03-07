"use client";

import { useState, useRef } from "react";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useAuthStore } from "@/lib/auth";
import { useMe, useLeaveRequests, useSubmitLeave, useCommissions, useChangePassword, useUpdateProfile, useSalarySlips, useUploadAvatar } from "@/lib/hooks";
import { initials, fmt } from "@/lib/utils";
import type { Commission, LeaveRequest } from "@/types";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: me } = useMe();
  const { data: leaveData } = useLeaveRequests({});
  const { data: commData } = useCommissions({ limit: 5 });
  const submitLeave = useSubmitLeave();
  const [slipYear, setSlipYear] = useState(new Date().getFullYear());
  const { data: salarySlips } = useSalarySlips(slipYear);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editName, setEditName] = useState("");
  const [nameEditing, setNameEditing] = useState(false);

  const changePassword = useChangePassword();
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "annual",
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

  const handleChangePassword = () => {
    setPwMsg(null);
    if (pwForm.new_password.length < 8) { setPwMsg({ type: "error", text: "New password must be at least 8 characters" }); return; }
    if (pwForm.new_password !== pwForm.confirm_password) { setPwMsg({ type: "error", text: "Passwords do not match" }); return; }
    changePassword.mutate(
      { current_password: pwForm.current_password, new_password: pwForm.new_password },
      {
        onSuccess: () => {
          setPwMsg({ type: "success", text: "Password changed successfully" });
          setPwForm({ current_password: "", new_password: "", confirm_password: "" });
        },
        onError: (err: any) => setPwMsg({ type: "error", text: err.message || "Failed to change password" }),
      }
    );
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadAvatar.mutate(file);
    e.target.value = "";
  };

  const meAny = me as unknown as Record<string, unknown> | undefined;
  const displayName = (meAny?.full_name as string) ?? user?.full_name ?? "User";
  const displayRole = (meAny?.crm_role as string) ?? (meAny?.role as string) ?? user?.role ?? "";
  const displayEmail = (meAny?.email as string) ?? user?.email ?? "";
  const profileImageUrl = (meAny?.profile_image_url as string) ?? null;

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
            {/* Avatar with upload */}
            <div
              className="relative w-[72px] h-[72px] rounded-full mx-auto mb-3 group cursor-pointer"
              onClick={() => avatarInputRef.current?.click()}
              title="Click to upload photo"
            >
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={displayName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-blue flex items-center justify-center text-2xl font-bold text-white">
                  {initials(displayName)}
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadAvatar.isPending ? (
                  <span className="text-white text-[10px]">...</span>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                className="hidden"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleAvatarUpload}
              />
            </div>

            {nameEditing ? (
              <div className="flex items-center gap-2 justify-center">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-center text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    updateProfile.mutate({ full_name: editName }, {
                      onSuccess: () => setNameEditing(false),
                    });
                  }}
                  disabled={updateProfile.isPending || editName.trim() === displayName}
                >
                  {updateProfile.isPending ? "..." : "Save"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setNameEditing(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div
                className="text-base font-bold text-navy cursor-pointer hover:underline"
                onClick={() => { setEditName(displayName); setNameEditing(true); }}
                title="Click to edit name"
              >
                {displayName}
              </div>
            )}
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
                        { value: "annual", label: "Annual Leave" },
                        { value: "sick", label: "Sick Leave" },
                        { value: "emergency", label: "Emergency" },
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
              <CardHeader
                title="Salary Slips"
                action={
                  <select
                    className="border border-border rounded px-2 py-1 text-xs bg-white"
                    value={slipYear}
                    onChange={(e) => setSlipYear(parseInt(e.target.value))}
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                }
              />
              {(!salarySlips || salarySlips.length === 0) ? (
                <div className="text-xs text-txt-light py-4 text-center">No salary data for {slipYear}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] font-mono text-txt-light uppercase">
                        <th className="py-2 pr-3">Month</th>
                        <th className="py-2 pr-3">Base Salary</th>
                        <th className="py-2 pr-3">Comm (USD)</th>
                        <th className="py-2 pr-3">Comm (PKR)</th>
                        <th className="py-2">Loads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salarySlips.map((slip) => (
                        <tr key={slip.month} className="border-b border-[#f0f2f5] last:border-0">
                          <td className="py-2 pr-3 font-medium">{new Date(slip.month).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</td>
                          <td className="py-2 pr-3 font-mono">Rs {(slip.base_salary_pkr_paisa / 100).toLocaleString()}</td>
                          <td className="py-2 pr-3 font-mono">{fmt(slip.total_commission_cents)}</td>
                          <td className="py-2 pr-3 font-mono">Rs {(slip.total_commission_pkr_paisa / 100).toLocaleString()}</td>
                          <td className="py-2 font-mono">{slip.load_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

            <Card>
              <CardHeader title="Change Password" />
              {pwMsg && (
                <div className={`rounded-md px-3 py-2 mb-3 text-xs ${pwMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-bg border border-red/30 text-red"}`}>
                  {pwMsg.text}
                </div>
              )}
              <div className="space-y-3">
                <Input label="Current Password" type="password" value={pwForm.current_password} onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} />
                <Input label="New Password" type="password" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} />
                <Input label="Confirm New Password" type="password" value={pwForm.confirm_password} onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleChangePassword} disabled={changePassword.isPending || !pwForm.current_password || !pwForm.new_password}>
                  {changePassword.isPending ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
