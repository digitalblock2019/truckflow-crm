"use client";

import { useState, useEffect, useRef } from "react";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useSettings, useUpdateSettings, useInvoiceBranding, useUpdateBranding, useUploadLogo } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import type { Setting } from "@/types";

function InvoiceBrandingCard() {
  const { data: branding, isLoading } = useInvoiceBranding();
  const updateBranding = useUpdateBranding();
  const uploadLogo = useUploadLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_website: "",
    invoice_footer_text: "",
    invoice_notes_default: "",
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (branding && !initialized.current) {
      initialized.current = true;
      const b = branding as Record<string, string>;
      setForm({
        company_name: b.company_name || "",
        company_address: b.company_address || "",
        company_phone: b.company_phone || "",
        company_email: b.company_email || "",
        company_website: b.company_website || "",
        invoice_footer_text: b.invoice_footer_text || "",
        invoice_notes_default: b.invoice_notes_default || "",
      });
    }
  }, [branding]);

  const handleSave = () => {
    setSaved(false);
    updateBranding.mutate(form, {
      onSuccess: () => { setDirty(false); setSaved(true); },
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(file);
    e.target.value = "";
  };

  const logoUrl = (branding as Record<string, string> | null)?.logo_url;

  if (isLoading) return (
    <Card>
      <div className="text-xs text-txt-light py-8 text-center">Loading branding...</div>
    </Card>
  );

  return (
    <Card>
      <CardHeader
        title="Invoice Branding"
        subtitle="Logo and company info shown on invoices"
        action={
          <Button onClick={handleSave} disabled={!dirty || updateBranding.isPending}>
            {updateBranding.isPending ? "Saving..." : "Save Branding"}
          </Button>
        }
      />
      {saved && (
        <div className="bg-green-bg border border-green/30 rounded-md px-3 py-2 mb-4 text-xs text-green">
          Branding saved successfully
        </div>
      )}

      {/* Logo */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-txt mb-2">Company Logo</div>
        <div className="flex items-center gap-4">
          <div className="w-[100px] h-[100px] border border-border rounded-lg flex items-center justify-center bg-white overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[10px] text-txt-light">No logo</span>
            )}
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploadLogo.isPending}
            >
              {uploadLogo.isPending ? "Uploading..." : "Upload Logo"}
            </Button>
            <input ref={fileRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.svg,.webp" onChange={handleLogoUpload} />
            <div className="text-[10px] text-txt-light mt-1">PNG, JPG, SVG, or WebP. Max 5 MB.</div>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Company Name"
          value={form.company_name}
          onChange={(e) => { setForm({ ...form, company_name: e.target.value }); setDirty(true); }}
        />
        <Input
          label="Phone"
          value={form.company_phone}
          onChange={(e) => { setForm({ ...form, company_phone: e.target.value }); setDirty(true); }}
        />
        <div className="col-span-2">
          <Input
            label="Address"
            value={form.company_address}
            onChange={(e) => { setForm({ ...form, company_address: e.target.value }); setDirty(true); }}
          />
        </div>
        <Input
          label="Email"
          value={form.company_email}
          onChange={(e) => { setForm({ ...form, company_email: e.target.value }); setDirty(true); }}
        />
        <Input
          label="Website"
          value={form.company_website}
          onChange={(e) => { setForm({ ...form, company_website: e.target.value }); setDirty(true); }}
        />
        <div className="col-span-2">
          <Input
            label="Invoice Footer Text"
            value={form.invoice_footer_text}
            onChange={(e) => { setForm({ ...form, invoice_footer_text: e.target.value }); setDirty(true); }}
          />
        </div>
        <div className="col-span-2">
          <Input
            label="Default Invoice Notes"
            value={form.invoice_notes_default}
            onChange={(e) => { setForm({ ...form, invoice_notes_default: e.target.value }); setDirty(true); }}
          />
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {};
      (settings as Setting[]).forEach((s) => {
        vals[s.key] = s.value;
      });
      setValues(vals);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(values, {
      onSuccess: () => setDirty(false),
    });
  };

  return (
    <>
      <Topbar
        title="Settings"
        subtitle="System configuration (admin only)"
        actions={
          dirty ? (
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Changes"}
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto p-6 bg-surface space-y-4">
        {isAdmin && <InvoiceBrandingCard />}

        {isLoading ? (
          <Card>
            <div className="text-xs text-txt-light py-8 text-center">Loading settings...</div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="System Settings" subtitle="Key-value configuration" />
            {updateSettings.isSuccess && (
              <div className="bg-green-bg border border-green/30 rounded-md px-3 py-2 mb-4 text-xs text-green">
                Settings saved successfully
              </div>
            )}
            <div className="space-y-3">
              {(settings as Setting[] ?? []).map((s) => (
                <div key={s.key} className="grid grid-cols-[200px_1fr] gap-3 items-center">
                  <div>
                    <div className="text-xs font-semibold text-txt">{s.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                    {s.description && (
                      <div className="text-[10px] text-txt-light mt-0.5">{s.description}</div>
                    )}
                  </div>
                  <Input
                    value={values[s.key] ?? ""}
                    onChange={(e) => {
                      setValues({ ...values, [s.key]: e.target.value });
                      setDirty(true);
                    }}
                  />
                </div>
              ))}
              {(!settings || (settings as Setting[]).length === 0) && (
                <div className="text-xs text-txt-light py-4 text-center">
                  No settings configured
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
