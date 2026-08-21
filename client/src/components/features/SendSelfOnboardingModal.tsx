"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { apiFetch, ApiError } from "@/lib/api";

// Default custom-message template. Agent can edit or clear before sending.
// {legalName} is interpolated at open time.
function defaultCustomMessage(legalName: string): string {
  return `Hi ${legalName}, please take a few minutes to complete your onboarding using the secure link. Fill in your details and upload the required documents. If any document isn't ready, just mark it "provide later" and we'll follow up.`;
}

// Path A modal — send a self-onboarding link to an EXISTING trucker row.
// (Path B — creating a new prospect record + sending in one flow — is a
// separate modal shipped in Phase B.)

interface Trucker {
  id: string;
  legal_name: string;
  mc_number: string | null;
  email: string | null;
  phone: string | null;
}

interface SendResult {
  requestId: string;
  expiresAt: string;
  sentTo: { email?: string; phone?: string };
  onboardingUrl: string;
}

const EXPIRY_OPTIONS = [
  { value: "7",  label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "0",  label: "No expiry" },
];

export default function SendSelfOnboardingModal({
  open,
  onClose,
  trucker,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  trucker: Trucker;
  onSent?: (result: SendResult) => void;
}) {
  const [emailChecked, setEmailChecked] = useState(true);
  // SMS is Phase 1-deferred. Checkbox is greyed out; kept in state to preserve
  // shape for when we enable it.
  const [smsChecked] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [customMessage, setCustomMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<SendResult | null>(null);

  // Seed the default message when the modal opens (and reset on close/reopen).
  useEffect(() => {
    if (open && !result) {
      setCustomMessage(defaultCustomMessage(trucker.legal_name));
    }
  }, [open, result, trucker.legal_name]);

  const hasEmail = Boolean(trucker.email?.trim());
  const hasPhone = Boolean(trucker.phone?.trim());
  const bothMissing = !hasEmail && !hasPhone;

  // In Phase 1 only email works. So the modal is functionally blocked if
  // there's no email at all, regardless of phone.
  const canSend = hasEmail && emailChecked;

  async function handleSend() {
    setError("");
    setSubmitting(true);
    try {
      const channels: string[] = [];
      if (emailChecked && hasEmail) channels.push("email");
      const res = await apiFetch<SendResult>(`/api/truckers/${trucker.id}/send-onboarding`, {
        method: "POST",
        body: JSON.stringify({
          channels,
          expiresInDays: Number(expiresInDays),
          customMessage: customMessage.trim() || undefined,
        }),
      });
      setResult(res);
      onSent?.(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to send onboarding link";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setResult(null);
    setError("");
    setCustomMessage("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Send self-onboarding request" width="520px" closeOnOverlay={false}>
      {result ? (
        <div>
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">📨</div>
            <div className="text-base font-semibold text-txt">Onboarding link sent</div>
            <div className="mt-1 text-sm text-txt-light">
              Sent to {result.sentTo.email}
              {result.expiresAt && (
                <> · expires {new Date(result.expiresAt).toLocaleDateString()}</>
              )}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs font-mono break-all mb-3">
            {result.onboardingUrl}
          </div>
          <div className="text-xs text-txt-light mb-4">
            You can copy this URL to share manually as a backup.
          </div>
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-sm text-txt mb-1">
            <span className="font-semibold">{trucker.legal_name}</span>
          </div>
          <div className="text-xs text-txt-light mb-4">
            MC# {trucker.mc_number ?? "not provided"}
          </div>

          {bothMissing && (
            <div className="mb-4 bg-red/5 border border-red/30 rounded-md p-3 text-xs text-red">
              This trucker has no email or phone on file. Add contact info before sending.
            </div>
          )}

          <div className="mb-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-txt-light mb-2">
              Send via
            </div>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 p-2 rounded border ${hasEmail ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                <input
                  type="checkbox"
                  checked={emailChecked && hasEmail}
                  disabled={!hasEmail}
                  onChange={(e) => setEmailChecked(e.target.checked)}
                />
                <div className="flex-1">
                  <div className="text-sm">Email</div>
                  <div className="text-xs text-txt-light">
                    {hasEmail ? trucker.email : "No email on file — edit the trucker to add one"}
                  </div>
                </div>
              </label>
              <label className="flex items-center gap-2 p-2 rounded border border-slate-200 opacity-70 cursor-not-allowed bg-slate-50" title="SMS coming soon">
                <input type="checkbox" checked={smsChecked} disabled />
                <div className="flex-1">
                  <div className="text-sm flex items-center gap-2">
                    SMS
                    <span className="text-[10px] font-mono uppercase font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">Coming soon</span>
                  </div>
                  <div className="text-xs text-txt-light">
                    {hasPhone ? trucker.phone : "No phone on file"}
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <Select
              label="Link expires in"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              options={EXPIRY_OPTIONS}
            />
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-txt-light mb-1">
              Custom message (optional)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value.slice(0, 300))}
              placeholder="Hi Marco, please complete your onboarding at your earliest convenience…"
              rows={3}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <div className="mt-1 text-[10px] text-txt-light text-right">
              {customMessage.length}/300
            </div>
          </div>

          {error && (
            <div className="mb-3 bg-red/5 border border-red/30 rounded-md p-3 text-xs text-red">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSend} disabled={!canSend || submitting}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
