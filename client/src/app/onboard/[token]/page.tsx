"use client";

// Public trucker self-onboarding form.
// Sits outside the (dashboard) route group so it renders without the app
// sidebar / topbar / auth. Authorization for this page comes entirely from
// the URL token being valid, unexpired, unrevoked, unsubmitted.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

// ---- Types (mirror the server's OnboardingFetchResult) ---------------------
interface DocumentType {
  id: string;
  slug: string;
  label: string;
  is_required: boolean;
  is_conditional: boolean;
  condition_flag: string | null;
  is_optional: boolean;
}

interface Trucker {
  id: string;
  legal_name: string;
  dba_name: string | null;
  mc_number: string | null;
  dot_number: string | null;
  entity_type: string | null;
  owner_driver_name: string | null;
  email: string | null;
  phone: string | null;
  physical_address: string | null;
  city: string | null;
  state: string | null;
  truck_types: string[] | null;
  truck_length_ft: string | null;
  truck_width_ft: string | null;
  truck_height_ft: string | null;
  max_payload_lbs: number | null;
  operation_type: string | null;
  preferred_lanes: unknown;
  operating_states: string[] | null;
  avoid_states: string[] | null;
  preferred_days: string[] | null;
}

interface FetchResult {
  request: {
    id: string;
    expiresAt: string;
    customMessage: string | null;
    submittedAlready: boolean;
  };
  trucker: Trucker;
  documentTypes: DocumentType[];
}

// Which conditional flags unlock which conditional docs.
const FLAG_META: { key: string; label: string; unlocks: string[] }[] = [
  { key: "uses_factoring",    label: "We use a factoring company",    unlocks: ["noa"] },
  { key: "is_new_authority",  label: "We are a new authority (< 6 months)", unlocks: ["cdl_copy"] },
  { key: "uses_quick_pay",    label: "We accept quick-pay",           unlocks: ["void_cheque"] },
];

const TRUCK_TYPE_OPTIONS = [
  { value: "dry_van",    label: "Dry Van" },
  { value: "reefer",     label: "Reefer" },
  { value: "flatbed",    label: "Flatbed" },
  { value: "box_truck",  label: "Box Truck" },
  { value: "tanker",     label: "Tanker" },
  { value: "other",      label: "Other" },
];

// Matches fmcsa_entity_type enum in the schema. Last option ("other") reveals
// a free-text input the trucker can fill.
const ENTITY_TYPE_OPTIONS = [
  { value: "",                label: "Select..." },
  { value: "corporation",     label: "Corporation" },
  { value: "llc",             label: "LLC" },
  { value: "sole_proprietor", label: "Sole Proprietor" },
  { value: "partnership",     label: "Partnership" },
  { value: "other",           label: "Other" },
];

export default function OnboardPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "loaded" | "error" | "submitted">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [data, setData] = useState<FetchResult | null>(null);

  // Form state — initialized from the fetched trucker.
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [provideLater, setProvideLater] = useState<Record<string, boolean>>({});
  const [signedName, setSignedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");

  // ---- Load token → prefill ------------------------------------------------
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/onboarding/${token}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          setErrorMessage(body?.error?.message || body?.message || "Unable to load this onboarding link");
          return;
        }
        const result = body as FetchResult;
        setData(result);
        setFields({
          dba_name:          result.trucker.dba_name ?? "",
          dot_number:        result.trucker.dot_number ?? "",
          entity_type:       result.trucker.entity_type ?? "",
          owner_driver_name: result.trucker.owner_driver_name ?? "",
          email:             result.trucker.email ?? "",
          phone:             result.trucker.phone ?? "",
          physical_address:  result.trucker.physical_address ?? "",
          city:              result.trucker.city ?? "",
          state:             result.trucker.state ?? "",
          truck_types:       result.trucker.truck_types ?? [],
          truck_length_ft:   result.trucker.truck_length_ft ?? "",
          truck_width_ft:    result.trucker.truck_width_ft ?? "",
          truck_height_ft:   result.trucker.truck_height_ft ?? "",
          max_payload_lbs:   result.trucker.max_payload_lbs ?? "",
          operation_type:    result.trucker.operation_type ?? "",
          operating_states:  result.trucker.operating_states ?? [],
          avoid_states:      result.trucker.avoid_states ?? [],
          preferred_days:    result.trucker.preferred_days ?? [],
          // MC# is only editable if it's currently null (prospect record).
          mc_number:         result.trucker.mc_number ?? "",
        });
        setState(result.request.submittedAlready ? "submitted" : "loaded");
      } catch {
        if (cancelled) return;
        setState("error");
        setErrorMessage("Network error. Please refresh and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ---- Which doc types to show. Required always. Conditional only when flag on.
  const visibleDocTypes = useMemo(() => {
    if (!data) return [];
    return data.documentTypes.filter((dt) => {
      if (dt.is_required) return true;
      if (dt.is_conditional) {
        return dt.condition_flag ? Boolean(flags[dt.condition_flag]) : false;
      }
      return dt.is_optional;   // include optional docs (trucker can attach if they want)
    });
  }, [data, flags]);

  // ---- Submit --------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!signedName.trim()) {
      setSubmitError("Please type your full name to sign.");
      return;
    }
    // Each visible required doc must either have a file OR be marked "provide later".
    for (const dt of visibleDocTypes) {
      if (!dt.is_required && !dt.is_conditional) continue;   // optional docs OK
      if (dt.is_conditional && !flags[dt.condition_flag as string]) continue;
      const hasFile = Boolean(docFiles[dt.slug]);
      const deferred = Boolean(provideLater[dt.slug]);
      if (!hasFile && !deferred) {
        setSubmitError(`Please upload "${dt.label}" or check "provide later".`);
        return;
      }
    }

    // If entity_type = "other", require the freeform specification and bundle
    // it into the notes field so the agent sees it (schema's entity_type is an
    // enum so we can't put freeform text there directly).
    if (fields.entity_type === "other") {
      const other = String(fields.entity_type_other ?? "").trim();
      if (!other) {
        setSubmitError('Please specify the entity type or pick another option.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      // Strip client-only helper fields from the payload; merge entity_type_other
      // into notes so the info survives without a schema change.
      const { entity_type_other: entityOther, ...serverFields } = fields as { entity_type_other?: string } & Record<string, unknown>;
      if (fields.entity_type === "other" && entityOther) {
        const existingNotes = String(serverFields.notes ?? "").trim();
        const suffix = `Entity type (other): ${entityOther}`;
        serverFields.notes = existingNotes ? `${existingNotes}\n${suffix}` : suffix;
      }
      const payload = {
        fields: serverFields,
        provideLater: Object.entries(provideLater)
          .filter(([, v]) => v)
          .map(([slug]) => slug),
        signedName: signedName.trim(),
      };
      form.append("payload", JSON.stringify(payload));
      for (const [slug, file] of Object.entries(docFiles)) {
        if (file) form.append(`doc:${slug}`, file);
      }

      const res = await fetch(`/api/public/onboarding/${token}/submit`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body?.error?.message || body?.message || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }
      setState("submitted");
    } catch {
      setSubmitError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  // ---- Render states -------------------------------------------------------
  if (state === "loading") {
    return <ShellCentered>Loading your onboarding form…</ShellCentered>;
  }

  if (state === "error") {
    return (
      <ShellCentered>
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-lg font-semibold text-slate-900 mb-2">Link unavailable</div>
          <div className="text-sm text-slate-600 max-w-md">{errorMessage}</div>
        </div>
      </ShellCentered>
    );
  }

  if (state === "submitted") {
    return (
      <ShellCentered>
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <div className="text-xl font-semibold text-slate-900 mb-2">Onboarding submitted</div>
          <div className="text-sm text-slate-600 max-w-md">
            Thank you. Your assigned agent has been notified. If you marked any
            documents "provide later," please email them to your agent as soon
            as they're ready.
          </div>
        </div>
      </ShellCentered>
    );
  }

  const trucker = data!.trucker;
  const req = data!.request;
  const mcEditable = trucker.mc_number === null || trucker.mc_number === "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 sm:py-5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="font-mono text-sm font-semibold tracking-widest text-slate-900">
            TRUCKFLOW <span className="text-blue-600">CRM</span>
          </div>
          <div className="mt-2 text-lg sm:text-xl font-semibold text-slate-900 leading-tight">
            Carrier Onboarding
          </div>
          <div className="mt-0.5 text-sm sm:text-base text-slate-700 leading-tight">
            {trucker.legal_name}
          </div>
          <div className="mt-2 text-xs sm:text-sm text-slate-500">
            This link expires {new Date(req.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {req.customMessage && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 sm:p-4 rounded text-sm text-slate-700">
            <div className="text-xs font-semibold text-blue-700 mb-1">Message from your agent</div>
            {req.customMessage}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Company */}
        <Section title="Company">
          <ReadOnly label="Legal name" value={trucker.legal_name} />
          <Row>
            <Field label="MC number" required disabled={!mcEditable}
              value={String(fields.mc_number ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, mc_number: v }))}
              hint={mcEditable ? "Federal MC number (required to complete)" : "MC# on file from FMCSA. Contact your agent to correct."}
            />
            <Field label="DOT number"
              value={String(fields.dot_number ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, dot_number: v }))}
            />
          </Row>
          <Field label="DBA / trade name"
            value={String(fields.dba_name ?? "")}
            onChange={(v) => setFields((f) => ({ ...f, dba_name: v }))}
          />
          <SelectField label="Entity type"
            value={String(fields.entity_type ?? "")}
            onChange={(v) => setFields((f) => ({ ...f, entity_type: v, entity_type_other: v === "other" ? f.entity_type_other ?? "" : undefined }))}
            options={ENTITY_TYPE_OPTIONS}
          />
          {fields.entity_type === "other" && (
            <Field label="Please specify entity type" required
              value={String(fields.entity_type_other ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, entity_type_other: v }))}
            />
          )}
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <Field label="Owner / primary contact name" required
            value={String(fields.owner_driver_name ?? "")}
            onChange={(v) => setFields((f) => ({ ...f, owner_driver_name: v }))}
          />
          <Row>
            <Field label="Email" type="email" required
              value={String(fields.email ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, email: v }))}
            />
            <Field label="Phone" required
              value={String(fields.phone ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, phone: v }))}
            />
          </Row>
        </Section>

        {/* Address */}
        <Section title="Address">
          <Field label="Physical address"
            value={String(fields.physical_address ?? "")}
            onChange={(v) => setFields((f) => ({ ...f, physical_address: v }))}
          />
          <Row>
            <Field label="City"
              value={String(fields.city ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, city: v }))}
            />
            <Field label="State"
              value={String(fields.state ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, state: v }))}
              hint="Two-letter code, e.g. TX"
            />
          </Row>
        </Section>

        {/* Equipment */}
        <Section title="Equipment">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Truck types</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {TRUCK_TYPE_OPTIONS.map((opt) => {
                const selected = ((fields.truck_types as string[] | undefined) ?? []).includes(opt.value);
                return (
                  <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer ${selected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <input type="checkbox" checked={selected} onChange={() => {
                      const cur = new Set((fields.truck_types as string[] | undefined) ?? []);
                      if (selected) cur.delete(opt.value); else cur.add(opt.value);
                      setFields((f) => ({ ...f, truck_types: Array.from(cur) }));
                    }} />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Field label="Length (ft)" type="number" value={String(fields.truck_length_ft ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, truck_length_ft: v }))} />
            <Field label="Width (ft)" type="number" value={String(fields.truck_width_ft ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, truck_width_ft: v }))} />
            <Field label="Height (ft)" type="number" value={String(fields.truck_height_ft ?? "")}
              onChange={(v) => setFields((f) => ({ ...f, truck_height_ft: v }))} />
          </div>
          <Field label="Max payload (lbs)" type="number" value={String(fields.max_payload_lbs ?? "")}
            onChange={(v) => setFields((f) => ({ ...f, max_payload_lbs: v }))} />
        </Section>

        {/* Operation profile */}
        <Section title="Operation">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Operation type</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { value: "local",    label: "Local",    hint: "Within ~150 mi of base" },
                { value: "regional", label: "Regional", hint: "Multi-state, ~500 mi radius" },
                { value: "otr",      label: "OTR",      hint: "Over-the-road, long-haul" },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-start gap-2 p-3 border rounded cursor-pointer ${fields.operation_type === opt.value ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <input type="radio" name="op" className="mt-0.5" checked={fields.operation_type === opt.value} onChange={() => setFields((f) => ({ ...f, operation_type: opt.value }))} />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-slate-500">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </Section>

        {/* Conditional flags */}
        <Section title="Additional info">
          <div className="space-y-2">
            {FLAG_META.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(flags[f.key])}
                  onChange={(e) => setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))} />
                {f.label}
              </label>
            ))}
          </div>
        </Section>

        {/* Documents */}
        <Section title="Documents">
          <div className="text-xs text-slate-500 mb-3">
            Accepted formats: PDF, JPG, PNG. Max 10 MB per file. If a document isn't ready, check "Provide later" and your agent will follow up.
          </div>
          {visibleDocTypes.length === 0 && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
              No document types are configured yet. You can still submit the form and your agent will follow up about documents separately.
              <div className="mt-1 text-xs text-slate-500">
                (Loaded {data?.documentTypes?.length ?? 0} doc type(s) from server.)
              </div>
            </div>
          )}
          <div className="space-y-3">
            {visibleDocTypes.map((dt) => {
              const later = Boolean(provideLater[dt.slug]);
              const file = docFiles[dt.slug];
              return (
                <div key={dt.slug} className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 flex items-center flex-wrap gap-2">
                        {dt.label}
                        {dt.is_required && <span className="text-[10px] font-mono uppercase text-red-700 bg-red-100 border border-red-200 rounded px-1.5 py-0.5">Required</span>}
                        {dt.is_conditional && <span className="text-[10px] font-mono uppercase text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">Conditional</span>}
                        {dt.is_optional && <span className="text-[10px] font-mono uppercase text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">Optional</span>}
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={later}
                        onChange={(e) => {
                          setProvideLater((p) => ({ ...p, [dt.slug]: e.target.checked }));
                          if (e.target.checked) setDocFiles((d) => ({ ...d, [dt.slug]: null }));
                        }} />
                      Provide later
                    </label>
                  </div>
                  {!later && (
                    <>
                      <label className="block cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => setDocFiles((d) => ({ ...d, [dt.slug]: e.target.files?.[0] ?? null }))}
                          className="sr-only"
                        />
                        <span className={`inline-flex items-center justify-center w-full sm:w-auto gap-2 px-4 py-2.5 rounded-md border-2 border-dashed cursor-pointer transition-colors ${file ? "border-green-400 bg-green-50 text-green-800 hover:bg-green-100" : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400"} font-medium text-sm`}>
                          {file ? (
                            <>
                              <span aria-hidden>✓</span>
                              <span>Change file</span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden>↑</span>
                              <span>Choose file to upload</span>
                            </>
                          )}
                        </span>
                      </label>
                      {file && (
                        <div className="mt-2 text-xs text-slate-600 break-all">
                          <span className="font-semibold">{file.name}</span>
                          <span className="text-slate-400"> ({Math.round(file.size / 1024)} KB)</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* E-signature */}
        <Section title="E-signature">
          <div className="text-xs text-slate-600 mb-3">
            By typing my full name, I certify the information provided is accurate
            and I authorize TruckFlow CRM to use it for onboarding and dispatch.
          </div>
          <Field label="Type your full name" required
            value={signedName}
            onChange={setSignedName}
            hint={`Signed on ${new Date().toLocaleString()}`}
          />
        </Section>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
            {submitError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="submit" disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm sm:text-base px-6 py-3 rounded w-full sm:w-auto">
            {submitting ? "Submitting…" : "Submit onboarding"}
          </button>
        </div>
      </form>

      <footer className="text-center text-xs text-slate-400 pb-8 px-4">
        TruckFlow CRM · Carrier Management
      </footer>
    </div>
  );
}

// ---- Small styled primitives (kept local — public form doesn't share dashboard styles)

function ShellCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 max-w-md w-full">
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}
function Field({ label, value, onChange, type = "text", required, disabled, hint }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} required={required} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded px-3 py-2.5 text-base sm:text-sm bg-white ${disabled ? "bg-slate-50 text-slate-500 border-slate-200" : "border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"}`} />
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}
function SelectField({ label, value, onChange, options, required, hint }: SelectFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border border-slate-300 rounded px-3 py-2.5 text-base sm:text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="w-full border border-slate-200 bg-slate-50 rounded px-3 py-2.5 text-base sm:text-sm text-slate-700 break-words">{value}</div>
    </div>
  );
}
