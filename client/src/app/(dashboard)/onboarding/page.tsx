"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import DocSlot from "@/components/features/DocSlot";
import Button from "@/components/ui/Button";
import RoutesAndAvailabilityFields, {
  type RoutesValue,
  emptyRoutes,
  routesValueFromTrucker,
  routesEqual,
  serializeRoutes,
} from "@/components/features/RoutesAndAvailabilityFields";
import { useTruckers, useTruckerDocuments, useUploadDocument, useMarkFullyOnboarded, useUpdateTrucker } from "@/lib/hooks";
import type { Trucker } from "@/types";

const TRUCK_KIND_OPTIONS = [
  { value: "dry_van", label: "Dry Van" },
  { value: "reefer", label: "Reefer" },
  { value: "flatbed", label: "Flatbed" },
  { value: "box_truck", label: "Box Truck" },
  { value: "tanker", label: "Tanker" },
  { value: "other", label: "Other" },
];

type ProfileForm = {
  city: string;
  power_units: string;
  truck_types: string[];
  truck_length_ft: string;
  truck_width_ft: string;
  truck_height_ft: string;
  max_payload_lbs: string;
  routes: RoutesValue;
};

const emptyProfile: ProfileForm = {
  city: "",
  power_units: "",
  truck_types: [],
  truck_length_ft: "",
  truck_width_ft: "",
  truck_height_ft: "",
  max_payload_lbs: "",
  routes: emptyRoutes,
};

const truckerToProfile = (t: Trucker): ProfileForm => ({
  city: t.city || "",
  power_units: t.power_units != null ? String(t.power_units) : "",
  truck_types: Array.isArray(t.truck_types) ? t.truck_types : [],
  truck_length_ft: t.truck_length_ft != null ? String(t.truck_length_ft) : "",
  truck_width_ft: t.truck_width_ft != null ? String(t.truck_width_ft) : "",
  truck_height_ft: t.truck_height_ft != null ? String(t.truck_height_ft) : "",
  max_payload_lbs: t.max_payload_lbs != null ? String(t.max_payload_lbs) : "",
  routes: routesValueFromTrucker(t),
});

export default function OnboardingPage() {
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: truckersData, isLoading } = useTruckers({ status: "onboarded", limit: 50 });
  const truckers = (truckersData?.data ?? []) as Trucker[];
  const { data: docs } = useTruckerDocuments(selectedId);
  const uploadDoc = useUploadDocument();
  const markOnboarded = useMarkFullyOnboarded();
  const updateTrucker = useUpdateTrucker();

  const [flagOverrides, setFlagOverrides] = useState<Record<string, boolean>>({});
  const baseTrucker = truckers.find((t) => t.id === selectedId);
  const selected = baseTrucker ? { ...baseTrucker, ...flagOverrides } as Trucker : undefined;

  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  useEffect(() => {
    if (baseTrucker) setProfile(truckerToProfile(baseTrucker));
    else setProfile(emptyProfile);
  }, [baseTrucker?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProfileTruckType = (value: string) => {
    setProfile((prev) => {
      const has = prev.truck_types.includes(value);
      return { ...prev, truck_types: has ? prev.truck_types.filter((t) => t !== value) : [...prev.truck_types, value] };
    });
  };

  const profileDirty = (() => {
    if (!baseTrucker) return false;
    const original = truckerToProfile(baseTrucker);
    if (profile.city !== original.city) return true;
    if (profile.power_units !== original.power_units) return true;
    if (profile.truck_length_ft !== original.truck_length_ft) return true;
    if (profile.truck_width_ft !== original.truck_width_ft) return true;
    if (profile.truck_height_ft !== original.truck_height_ft) return true;
    if (profile.max_payload_lbs !== original.max_payload_lbs) return true;
    if (profile.truck_types.length !== original.truck_types.length) return true;
    if (profile.truck_types.some((v) => !original.truck_types.includes(v))) return true;
    if (!routesEqual(profile.routes, original.routes)) return true;
    return false;
  })();

  const handleSaveProfile = () => {
    if (!selected) return;
    updateTrucker.mutate({
      id: selected.id,
      city: profile.city || null,
      power_units: profile.power_units ? parseInt(profile.power_units) || null : null,
      truck_types: profile.truck_types.length ? profile.truck_types : null,
      truck_length_ft: profile.truck_length_ft ? parseFloat(profile.truck_length_ft) || null : null,
      truck_width_ft: profile.truck_width_ft ? parseFloat(profile.truck_width_ft) || null : null,
      truck_height_ft: profile.truck_height_ft ? parseFloat(profile.truck_height_ft) || null : null,
      max_payload_lbs: profile.max_payload_lbs ? parseInt(profile.max_payload_lbs) || null : null,
      ...serializeRoutes(profile.routes),
    } as Partial<Trucker> & { id: string });
  };

  // Calculate onboarding progress from docs
  const docsArr = docs ?? [];
  const uploadedCount = docsArr.filter((d) => d.uploaded).length;
  const progress = docsArr.length > 0 ? Math.round((uploadedCount / docsArr.length) * 100) : 0;
  // Require at least one configured doc type; an empty list otherwise passes vacuously.
  const allRequiredUploaded = docsArr.length > 0 && docsArr.filter((d) => d.required).every((d) => d.uploaded);

  // Toast state — optimistic. Set immediately on click so feedback is always
  // visible. If the mutation later fails, we replace the success toast with a
  // red error toast that surfaces the server error message verbatim.
  type Toast = { kind: "success" | "error"; text: string };
  const [onboardedToast, setOnboardedToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!onboardedToast) return;
    // Errors stay visible longer (6s) so the user has time to read the message.
    const ms = onboardedToast.kind === "error" ? 6000 : 4000;
    const t = setTimeout(() => setOnboardedToast(null), ms);
    return () => clearTimeout(t);
  }, [onboardedToast]);

  // Render toast via portal directly onto document.body so it can't be clipped
  // or repositioned by any ancestor with transform/overflow/contain.
  // Every visual property is inline so a missing Tailwind utility cannot hide it.
  const toastNode =
    typeof document !== "undefined" && onboardedToast
      ? (() => {
          const isError = onboardedToast.kind === "error";
          const accent = isError ? "#dc2626" : "#16a34a";
          const icon = isError ? "!" : "✓";
          return createPortal(
            <div
              role={isError ? "alert" : "status"}
              aria-live={isError ? "assertive" : "polite"}
              style={{
                position: "fixed",
                top: 24,
                right: 24,
                zIndex: 2147483647,
                maxWidth: 480,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                backgroundColor: "#ffffff",
                borderLeft: `4px solid ${accent}`,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backgroundColor: accent,
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {icon}
              </span>
              <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 500, lineHeight: 1.5 }}>
                {onboardedToast.text}
              </span>
              <button
                type="button"
                onClick={() => setOnboardedToast(null)}
                aria-label="Dismiss"
                style={{
                  marginLeft: 8,
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>,
            document.body,
          );
        })()
      : null;

  return (
    <>
      {toastNode}
      <Topbar title="Onboarding" subtitle="Track trucker onboarding progress and documents" />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface">
        <div className="grid grid-cols-[340px_1fr] gap-4">
          <Card className="!p-0 max-h-[calc(100vh-140px)] overflow-y-auto">
            <div className="bg-navy px-4 py-4 rounded-t-xl">
              <h3 className="text-sm font-bold text-white tracking-wide">Onboarding Queue</h3>
              <p className="text-[11px] text-white/60 mt-0.5">{truckers.length} truckers</p>
            </div>
            {isLoading ? (
              <div className="p-4 text-xs text-txt-light">Loading...</div>
            ) : truckers.length === 0 ? (
              <div className="p-4 text-xs text-txt-light text-center">No truckers in onboarding</div>
            ) : (
              truckers.map((t) => {
                const tDocsUploaded = (t as any).docs_uploaded ?? null;
                const tDocsRequired = (t as any).docs_required ?? null;
                const hasDocInfo = tDocsRequired !== null && tDocsRequired > 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedId(t.id); setFlagOverrides({}); }}
                    className={`w-full text-left px-4 py-3 border-b border-[#f0f2f5] cursor-pointer transition-colors
                      ${t.id === selectedId ? "bg-[#f0f6ff]" : "hover:bg-[#f8faff]"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-txt">{t.legal_name}</span>
                      <Badge color="blue">{t.status_system?.replace(/_/g, " ") ?? "—"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-txt-light font-mono">{t.mc_number}</span>
                      {hasDocInfo && (
                        <span className="text-[10px] text-txt-mid font-mono">
                          {tDocsUploaded}/{tDocsRequired} docs
                        </span>
                      )}
                    </div>
                    {hasDocInfo && (
                      <div className="mt-1.5 bg-surface-mid rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-green rounded-full transition-[width] duration-300"
                          style={{ width: `${Math.round((tDocsUploaded / tDocsRequired) * 100)}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </Card>

          <div>
            {selected ? (
              <Card>
                <CardHeader
                  title={selected.legal_name}
                  subtitle={`MC# ${selected.mc_number}`}
                />
                {docsArr.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-txt-mid">{progress}% complete</span>
                      <span className="text-[10px] text-txt-light">({uploadedCount}/{docsArr.length} docs)</span>
                    </div>
                    <ProgressBar value={progress} className="mb-5" />
                  </>
                )}
                {/* Conditional flags */}
                <div className="flex flex-wrap gap-4 mb-4 p-3 bg-surface-mid rounded-lg">
                  {([
                    { key: "uses_factoring", label: "Uses Factoring" },
                    { key: "is_new_authority", label: "New Authority" },
                    { key: "uses_quick_pay", label: "Uses Quick Pay" },
                  ] as const).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!(selected as any)[key]}
                        onClick={() => {
                          const newVal = !(selected as any)[key];
                          setFlagOverrides((prev) => ({ ...prev, [key]: newVal }));
                          updateTrucker.mutate({
                            id: selected.id,
                            [key]: newVal,
                          } as any);
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          (selected as any)[key] ? "bg-blue" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            (selected as any)[key] ? "translate-x-[18px]" : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                      <span className="text-txt-mid">{label}</span>
                    </label>
                  ))}
                </div>

                {/* Trucker Profile (city, fleet, truck kinds, dimensions) */}
                <div className="mb-5 p-4 border border-border rounded-lg">
                  <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">
                    Trucker Profile
                  </h4>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <Input
                      label="City"
                      value={profile.city}
                      onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    />
                    <Input
                      label="State"
                      value={selected.state || ""}
                      locked
                      readOnly
                    />
                    <Input
                      label="Number of Trucks"
                      type="number"
                      min="0"
                      value={profile.power_units}
                      onChange={(e) => setProfile({ ...profile, power_units: e.target.value })}
                    />
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Truck Kind(s)</div>
                    <div className="flex flex-wrap gap-2">
                      {TRUCK_KIND_OPTIONS.map((opt) => {
                        const checked = profile.truck_types.includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-2 px-3 py-1.5 border rounded-md text-xs cursor-pointer transition-colors
                              ${checked ? "border-blue bg-blue/5 text-blue" : "border-border text-txt-mid hover:bg-surface-mid"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProfileTruckType(opt.value)}
                              className="accent-blue"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                    {selected.truck_type && !profile.truck_types.length && (
                      <div className="mt-1.5 text-[10px] text-txt-light">Legacy value: {selected.truck_type}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Truck Dimensions</div>
                    <div className="grid grid-cols-4 gap-3">
                      <Input
                        label="Length (ft)"
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.truck_length_ft}
                        onChange={(e) => setProfile({ ...profile, truck_length_ft: e.target.value })}
                      />
                      <Input
                        label="Width (ft)"
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.truck_width_ft}
                        onChange={(e) => setProfile({ ...profile, truck_width_ft: e.target.value })}
                      />
                      <Input
                        label="Height (ft)"
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.truck_height_ft}
                        onChange={(e) => setProfile({ ...profile, truck_height_ft: e.target.value })}
                      />
                      <Input
                        label="Max Payload (lbs)"
                        type="number"
                        min="0"
                        value={profile.max_payload_lbs}
                        onChange={(e) => setProfile({ ...profile, max_payload_lbs: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Routes & Availability — shared component */}
                  <div className="mt-5 pt-4 border-t border-border">
                    <RoutesAndAvailabilityFields
                      value={profile.routes}
                      onChange={(routes) => setProfile({ ...profile, routes })}
                    />
                  </div>

                  {profileDirty && (
                    <div className="mt-3">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={updateTrucker.isPending}
                        className="w-full"
                      >
                        {updateTrucker.isPending ? "Saving..." : "Save Profile"}
                      </Button>
                    </div>
                  )}
                </div>

                <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">
                  Document Checklist
                </h4>
                <div className="grid grid-cols-3 gap-2.5">
                  {docsArr.map((doc) => (
                    <DocSlot
                      key={doc.type_slug}
                      doc={doc}
                      truckerId={selected.id}
                      onUpload={(slug, file) =>
                        uploadDoc.mutate({
                          truckerId: selected.id,
                          typeSlug: slug,
                          file,
                        })
                      }
                    />
                  ))}
                </div>
                {docsArr.length === 0 && (
                  <div className="text-xs text-txt-light py-8 text-center">
                    No document types configured for this trucker
                  </div>
                )}

                {/* Mark as Fully Onboarded */}
                <div className="mt-5 pt-4 border-t border-border">
                  <Button
                    onClick={() => {
                      const name = selected.legal_name;
                      const id = selected.id;
                      // Optimistic: show success toast immediately. The user
                      // always sees feedback, even if state churn from query
                      // invalidation would otherwise hide the callback path.
                      setOnboardedToast({
                        kind: "success",
                        text: `${name} marked as fully onboarded`,
                      });
                      markOnboarded.mutate(id, {
                        onSuccess: () => {
                          setSelectedId("");
                        },
                        onError: (err) => {
                          // Replace optimistic success with the actual error so
                          // the user sees what went wrong (and we can debug).
                          setOnboardedToast({
                            kind: "error",
                            text: (err as Error)?.message || "Failed to mark fully onboarded",
                          });
                        },
                      });
                    }}
                    disabled={markOnboarded.isPending || !allRequiredUploaded}
                    className={`w-full ${allRequiredUploaded ? "!bg-green !border-green hover:!bg-green/90" : "!bg-green/50 !border-green/50 !cursor-not-allowed"}`}
                  >
                    {markOnboarded.isPending ? "Marking..." : "Mark as Fully Onboarded"}
                  </Button>
                  {docsArr.length === 0 && (
                    <p className="text-[10px] text-txt-light mt-1.5 text-center">
                      No document types configured — cannot mark fully onboarded
                    </p>
                  )}
                  {!allRequiredUploaded && docsArr.length > 0 && (
                    <p className="text-[10px] text-txt-light mt-1.5 text-center">
                      {docsArr.filter((d) => d.required && !d.uploaded).length} required document(s) still missing
                    </p>
                  )}
                  {allRequiredUploaded && progress < 100 && docsArr.length > 0 && (
                    <p className="text-[10px] text-txt-light mt-1.5 text-center">
                      {docsArr.length - uploadedCount} optional document(s) remaining
                    </p>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="flex items-center justify-center h-64">
                <div className="text-sm text-txt-light">
                  Select a trucker from the list to view documents
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
