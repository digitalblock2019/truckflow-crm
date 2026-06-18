"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import InfoTip from "@/components/ui/InfoTip";
import { useCreateLoad, useUploadLoadDocument, useTruckers, useEmployees } from "@/lib/hooks";
import type { Load } from "@/types";

const EQUIPMENT_OPTIONS = [
  { value: "", label: "Select equipment..." },
  { value: "dry_van", label: "Dry van" },
  { value: "reefer", label: "Reefer" },
  { value: "flatbed", label: "Flatbed" },
  { value: "step_deck", label: "Step deck" },
  { value: "power_only", label: "Power only" },
  { value: "hotshot", label: "Hotshot" },
  { value: "cargo_van", label: "Cargo Van" },
  { value: "sprinter_van", label: "Sprinter Van" },
  { value: "box_truck", label: "Box Truck" },
];

const TRAILER_LENGTH_OPTIONS = [
  { value: "", label: "—" },
  { value: "9", label: "9 ft" },
  { value: "12", label: "12 ft" },
  { value: "16", label: "16 ft" },
  { value: "26", label: "26 ft" },
  { value: "48", label: "48 ft" },
  { value: "53", label: "53 ft" },
];

const LOAD_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "full", label: "Full (FTL)" },
  { value: "partial", label: "Partial" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const CA_PROVINCES = [
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT",
];
// US states default; Canadian provinces appended after a disabled separator
// so dispatchers can still pick a CA destination when a load runs north.
const stateOptions = [
  { value: "", label: "ST" },
  ...US_STATES.map((s) => ({ value: s, label: s })),
  { value: "__ca_sep__", label: "── Canada ──", disabled: true },
  ...CA_PROVINCES.map((p) => ({ value: p, label: p })),
];

const emptyForm = {
  // People & Broker
  trucker_id: "",
  dispatcher_id: "",
  broker_name: "",
  broker_mc_number: "",
  // Route
  origin_city: "",
  origin_state: "",
  origin_zip: "",
  dest_city: "",
  dest_state: "",
  dest_zip: "",
  loaded_miles: "",
  deadhead_miles: "",
  // Schedule
  pickup_at: "",
  delivery_at: "",
  // Freight
  equipment_type: "",
  trailer_length_ft: "",
  load_type: "",
  commodity: "",
  weight_lbs: "",
  is_hazmat: false,
  tarps_required: false,
  team_drivers: false,
  liftgate_required: false,
  // Pay (dollar amounts as typed; pct as a whole number like "8")
  linehaul: "",
  rate_per_mile: "",
  fuel_surcharge: "",
  accessorials: "",
  company_commission_pct: "",
  // References
  broker_load_number: "",
  bol_number: "",
  notes: "",
};

type LoadForm = typeof emptyForm;

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function FlagCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-txt-mid cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue"
      />
      {label}
    </label>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateLoadModal({ open, onClose }: Props) {
  const [form, setForm] = useState<LoadForm>(emptyForm);
  const [rateConFile, setRateConFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const createLoad = useCreateLoad();
  const uploadLoadDoc = useUploadLoadDocument();
  const { data: truckersData } = useTruckers({ status: "fully_onboarded", limit: 100 });
  const { data: dispatchersData } = useEmployees({ type: "dispatcher", status: "active", limit: 100 });

  const set = <K extends keyof LoadForm>(key: K, value: LoadForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ---- Two-way pay binding: linehaul = rate_per_mile × loaded_miles ----
  // Editing any of the three keeps the trio consistent. Linehaul is the anchor
  // (it's what gets stored); rate_per_mile is a convenience for dispatchers who
  // negotiate by per-mile rate.
  const milesNum = (v: string) => parseInt(v, 10) || 0;
  const setLinehaul = (v: string) =>
    setForm((prev) => {
      const m = milesNum(prev.loaded_miles);
      return {
        ...prev,
        linehaul: v,
        rate_per_mile: m > 0 ? ((parseFloat(v) || 0) / m).toFixed(2) : prev.rate_per_mile,
      };
    });
  const setRatePerMile = (v: string) =>
    setForm((prev) => {
      const m = milesNum(prev.loaded_miles);
      return {
        ...prev,
        rate_per_mile: v,
        linehaul: m > 0 ? ((parseFloat(v) || 0) * m).toFixed(2) : prev.linehaul,
      };
    });
  const setLoadedMiles = (v: string) =>
    setForm((prev) => {
      const m = milesNum(v);
      return {
        ...prev,
        loaded_miles: v,
        rate_per_mile:
          m > 0 && prev.linehaul ? ((parseFloat(prev.linehaul) || 0) / m).toFixed(2) : prev.rate_per_mile,
      };
    });

  // Company Commission = Load Total × company_commission_pct. The % field is
  // pre-filled from the selected trucker's negotiated rate but stays editable.
  const companyPct = (parseFloat(form.company_commission_pct) || 0) / 100;

  // Picking a trucker pre-fills the company commission % with that trucker's
  // negotiated rate (still editable afterward).
  const handleTruckerChange = (truckerId: string) => {
    const trucker = (truckersData?.data ?? []).find((t) => t.id === truckerId);
    const pct = trucker ? parseFloat(String(trucker.company_commission_pct ?? "0")) || 0 : 0;
    setForm((prev) => ({
      ...prev,
      trucker_id: truckerId,
      company_commission_pct: pct ? String(+(pct * 100).toFixed(2)) : "",
    }));
  };

  // ---- Live pay summary ----
  const pay = useMemo(() => {
    const dollars = (s: string) => parseFloat(s) || 0;
    const gross = dollars(form.linehaul) + dollars(form.fuel_surcharge) + dollars(form.accessorials);
    const miles = parseInt(form.loaded_miles, 10);
    const hasMiles = Number.isFinite(miles) && miles > 0;
    return {
      gross,
      allInPerMile: hasMiles ? gross / miles : null,
      companyCommission: gross * companyPct,
    };
  }, [form.linehaul, form.fuel_surcharge, form.accessorials, form.loaded_miles, companyPct]);

  // ---- Validation ----
  const missing: string[] = [];
  if (!form.trucker_id) missing.push("Trucker");
  if (!form.dispatcher_id) missing.push("Dispatcher");
  if (!form.origin_city.trim()) missing.push("Origin city");
  if (!form.origin_state) missing.push("Origin state");
  if (!form.dest_city.trim()) missing.push("Destination city");
  if (!form.dest_state) missing.push("Destination state");
  if (!form.pickup_at) missing.push("Pickup date");
  if (!form.equipment_type) missing.push("Equipment type");
  if (!form.linehaul.trim()) missing.push("Linehaul amount");

  const reset = () => {
    setForm(emptyForm);
    setRateConFile(null);
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (missing.length > 0) return;

    const dollarsToCents = (s: string) => Math.round((parseFloat(s) || 0) * 100);
    const intOrNull = (s: string) => (s.trim() ? parseInt(s, 10) || null : null);

    const payload: Partial<Load> = {
      trucker_id: form.trucker_id,
      dispatcher_id: form.dispatcher_id,
      broker_name: form.broker_name.trim() || null,
      broker_mc_number: form.broker_mc_number.trim() || null,
      origin_city: form.origin_city.trim() || null,
      origin_state: form.origin_state || null,
      origin_zip: form.origin_zip.trim() || null,
      dest_city: form.dest_city.trim() || null,
      dest_state: form.dest_state || null,
      dest_zip: form.dest_zip.trim() || null,
      loaded_miles: intOrNull(form.loaded_miles),
      deadhead_miles: intOrNull(form.deadhead_miles),
      pickup_at: form.pickup_at || null,
      delivery_at: form.delivery_at || null,
      equipment_type: form.equipment_type || null,
      trailer_length_ft: intOrNull(form.trailer_length_ft),
      load_type: form.load_type || null,
      commodity: form.commodity.trim() || null,
      weight_lbs: intOrNull(form.weight_lbs),
      is_hazmat: form.is_hazmat,
      tarps_required: form.tarps_required,
      team_drivers: form.team_drivers,
      liftgate_required: form.liftgate_required,
      linehaul_amount_cents: dollarsToCents(form.linehaul),
      fuel_surcharge_cents: dollarsToCents(form.fuel_surcharge),
      accessorials_cents: dollarsToCents(form.accessorials),
      // Form shows a whole-number percent; DB stores a fraction (8 -> 0.08).
      // Blank lets the backend fall back to the trucker's negotiated rate.
      company_commission_pct: form.company_commission_pct.trim()
        ? (parseFloat(form.company_commission_pct) || 0) / 100
        : null,
      broker_load_number: form.broker_load_number.trim() || null,
      bol_number: form.bol_number.trim() || null,
      notes: form.notes.trim() || null,
    };

    createLoad.mutate(payload, {
      onSuccess: (created: Load) => {
        // Rate confirmation can only attach after the load row exists, so the
        // upload is a second step keyed on the returned load id.
        if (rateConFile && created?.id) {
          uploadLoadDoc.mutate({ loadId: created.id, docType: "rate_con", file: rateConFile });
        }
        handleClose();
      },
    });
  };

  const showError = submitted && missing.length > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Create New Load" width="760px" closeOnOverlay={false}>
      <div className="max-h-[68vh] overflow-y-auto pr-1">
        {/* 1. People & Broker */}
        <FormSection title="People & Broker">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Trucker"
              value={form.trucker_id}
              onChange={(e) => handleTruckerChange(e.target.value)}
              options={[
                { value: "", label: "Select trucker..." },
                ...(truckersData?.data ?? []).map((t) => ({ value: t.id, label: t.legal_name })),
              ]}
            />
            <Select
              label="Dispatcher"
              value={form.dispatcher_id}
              onChange={(e) => set("dispatcher_id", e.target.value)}
              options={[
                { value: "", label: "Select dispatcher..." },
                // Defensive dedup by id — a duplicate employee row in the DB
                // would otherwise show the same name twice in the dropdown.
                ...(dispatchersData?.data ?? [])
                  .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)
                  .map((d) => ({ value: d.id, label: d.full_name })),
              ]}
            />
            <Input
              label="Broker / Shipper Company"
              tooltip="The broker or shipping company that posted this load."
              value={form.broker_name}
              onChange={(e) => set("broker_name", e.target.value)}
            />
            <Input
              label="Broker MC Number"
              tooltip="The broker's MC (motor carrier) number."
              value={form.broker_mc_number}
              onChange={(e) => set("broker_mc_number", e.target.value)}
            />
          </div>
        </FormSection>

        {/* 2. Route */}
        <FormSection title="Route">
          <div className="grid grid-cols-[1fr_70px_90px] gap-3 mb-3">
            <Input label="Origin City" value={form.origin_city} onChange={(e) => set("origin_city", e.target.value)} />
            <Select label="State" value={form.origin_state} onChange={(e) => set("origin_state", e.target.value)} options={stateOptions} />
            <Input label="ZIP" value={form.origin_zip} onChange={(e) => set("origin_zip", e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_70px_90px] gap-3 mb-3">
            <Input label="Destination City" value={form.dest_city} onChange={(e) => set("dest_city", e.target.value)} />
            <Select label="State" value={form.dest_state} onChange={(e) => set("dest_state", e.target.value)} options={stateOptions} />
            <Input label="ZIP" value={form.dest_zip} onChange={(e) => set("dest_zip", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Loaded Miles" tooltip="Miles driven with the load on board — pickup to delivery." type="number" min="0" value={form.loaded_miles} onChange={(e) => setLoadedMiles(e.target.value)} />
            <Input label="Deadhead Miles (optional)" tooltip="Empty miles driven to reach the pickup. No cargo, no pay." type="number" min="0" value={form.deadhead_miles} onChange={(e) => set("deadhead_miles", e.target.value)} />
          </div>
        </FormSection>

        {/* 3. Schedule */}
        <FormSection title="Schedule">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pickup Date & Time" type="datetime-local" value={form.pickup_at} onChange={(e) => set("pickup_at", e.target.value)} />
            <Input label="Delivery Date & Time" type="datetime-local" value={form.delivery_at} onChange={(e) => set("delivery_at", e.target.value)} />
          </div>
        </FormSection>

        {/* 4. Freight */}
        <FormSection title="Freight">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Select label="Equipment Type" tooltip="The trailer type this load requires." value={form.equipment_type} onChange={(e) => set("equipment_type", e.target.value)} options={EQUIPMENT_OPTIONS} />
            <Select label="Trailer Length" tooltip="Trailer length the load requires." value={form.trailer_length_ft} onChange={(e) => set("trailer_length_ft", e.target.value)} options={TRAILER_LENGTH_OPTIONS} />
            <Select label="Load Type" tooltip="Full (FTL) uses the whole trailer for one load. Partial shares trailer space with other freight." value={form.load_type} onChange={(e) => set("load_type", e.target.value)} options={LOAD_TYPE_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input label="Commodity" tooltip="What is being hauled — e.g. steel coils, frozen produce, auto parts, general freight." value={form.commodity} onChange={(e) => set("commodity", e.target.value)} />
            <Input label="Weight (lbs)" tooltip="Total cargo weight in pounds." type="number" min="0" value={form.weight_lbs} onChange={(e) => set("weight_lbs", e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-5 pt-1">
            <FlagCheckbox label="Hazmat" checked={form.is_hazmat} onChange={(v) => set("is_hazmat", v)} />
            <FlagCheckbox label="Tarps required" checked={form.tarps_required} onChange={(v) => set("tarps_required", v)} />
            <FlagCheckbox label="Team drivers" checked={form.team_drivers} onChange={(v) => set("team_drivers", v)} />
            <FlagCheckbox label="Liftgate" checked={form.liftgate_required} onChange={(v) => set("liftgate_required", v)} />
          </div>
        </FormSection>

        {/* 5. Pay */}
        <FormSection title="Pay">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input
              label="Linehaul ($)"
              tooltip="Base freight charge — the core negotiated rate, before fuel and extras."
              type="number" min="0" step="0.01"
              value={form.linehaul}
              onChange={(e) => setLinehaul(e.target.value)}
            />
            <Input
              label="Rate / Mile ($)"
              tooltip="Linehaul divided by loaded miles. Enter this OR linehaul — the other fills in automatically (needs loaded miles)."
              type="number" min="0" step="0.01"
              value={form.rate_per_mile}
              onChange={(e) => setRatePerMile(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Fuel Surcharge ($)"
              tooltip="Separate line item to offset fuel cost."
              type="number" min="0" step="0.01"
              value={form.fuel_surcharge}
              onChange={(e) => set("fuel_surcharge", e.target.value)}
            />
            <Input
              label="Accessorials ($)"
              tooltip="Extra fees — detention, lumper, layover, tarping, etc."
              type="number" min="0" step="0.01"
              value={form.accessorials}
              onChange={(e) => set("accessorials", e.target.value)}
            />
            <Input
              label="Company Commission (%)"
              tooltip="Your dispatching company's cut of the load, as a percentage of the Load Total. Pre-filled from the selected trucker's negotiated rate (usually 8%) — editable per load."
              type="number" min="0" step="0.1"
              value={form.company_commission_pct}
              onChange={(e) => set("company_commission_pct", e.target.value)}
            />
          </div>
          {/* Live summary */}
          <div className="mt-3 bg-surface-mid rounded-lg px-4 py-3 grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-mono text-txt-light uppercase">Load Total</div>
              <div className="mt-0.5 text-sm font-mono font-semibold text-txt">{money(Math.round(pay.gross * 100))}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-txt-light uppercase">All-in / Mile</div>
              <div className="mt-0.5 text-sm font-mono font-semibold text-txt">
                {pay.allInPerMile != null ? `$${pay.allInPerMile.toFixed(2)}` : "–"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-txt-light uppercase flex items-center">
                Company Comm.{companyPct > 0 ? ` (${+(companyPct * 100).toFixed(2)}%)` : ""}
                <InfoTip text="Your dispatching company's cut of the load — Load Total × the company commission rate (usually 8%, negotiated per trucker)." />
              </div>
              <div className="mt-0.5 text-sm font-mono font-semibold text-txt">
                {companyPct > 0 ? money(Math.round(pay.companyCommission * 100)) : "–"}
              </div>
            </div>
          </div>
          {companyPct <= 0 && (
            <p className="mt-1.5 text-[10px] text-txt-light">
              Pick a trucker to auto-fill the company commission %, or enter it manually above.
            </p>
          )}
        </FormSection>

        {/* 6. References & Docs */}
        <FormSection title="References & Docs">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input label="Broker Load #" tooltip="The broker's reference number for this load." value={form.broker_load_number} onChange={(e) => set("broker_load_number", e.target.value)} />
            <Input label="BOL # (optional)" tooltip="Bill of Lading number — the shipping document signed at pickup/delivery." value={form.bol_number} onChange={(e) => set("bol_number", e.target.value)} />
          </div>
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-1">
              Rate Confirmation (PDF)
            </div>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setRateConFile(e.target.files?.[0] ?? null)}
              className="text-xs text-txt-mid"
            />
            {rateConFile && (
              <div className="mt-1 text-[11px] text-txt-light">{rateConFile.name}</div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-1">
              Notes
            </div>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white
                focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
            />
          </div>
        </FormSection>
      </div>

      {showError && (
        <div className="mt-3 px-3 py-2 bg-red/5 border border-red/30 rounded-md text-xs text-red">
          Required: {missing.join(", ")}
        </div>
      )}
      {createLoad.isError && (
        <div className="mt-3 px-3 py-2 bg-red/5 border border-red/30 rounded-md text-xs text-red">
          {(createLoad.error as Error)?.message || "Failed to create load"}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={createLoad.isPending}>
          {createLoad.isPending ? "Creating..." : "Create Load"}
        </Button>
      </div>
    </Modal>
  );
}
