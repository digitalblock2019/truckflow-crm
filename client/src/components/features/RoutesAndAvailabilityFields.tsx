"use client";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import type { PreferredLane } from "@/types";

export type RoutesValue = {
  operation_type: string;
  preferred_lanes: PreferredLane[];
  operating_states: string[];
  avoid_states: string[];
  preferred_days: string[];
};

export const emptyRoutes: RoutesValue = {
  operation_type: "",
  preferred_lanes: [],
  operating_states: [],
  avoid_states: [],
  preferred_days: [],
};

export const OPERATION_TYPE_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "local", label: "Local (within ~150 mi)" },
  { value: "regional", label: "Regional (multi-state)" },
  { value: "otr", label: "OTR (long-haul, nationwide)" },
];

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const CA_PROVINCES = [
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT",
];
// US states default; Canadian provinces appended after a disabled separator
// in the lane state pickers so dispatchers can pick CA destinations.
const stateSelectOptions = [
  { value: "", label: "—" },
  ...US_STATES.map((s) => ({ value: s, label: s })),
  { value: "__ca_sep__", label: "── Canada ──", disabled: true },
  ...CA_PROVINCES.map((p) => ({ value: p, label: p })),
];

type TruckerLike = {
  operation_type?: string | null;
  preferred_lanes?: PreferredLane[] | null;
  operating_states?: string[] | null;
  avoid_states?: string[] | null;
  preferred_days?: string[] | null;
};

export const routesValueFromTrucker = (t: TruckerLike): RoutesValue => ({
  operation_type: t.operation_type || "",
  preferred_lanes: Array.isArray(t.preferred_lanes) ? t.preferred_lanes : [],
  operating_states: Array.isArray(t.operating_states) ? t.operating_states : [],
  avoid_states: Array.isArray(t.avoid_states) ? t.avoid_states : [],
  preferred_days: Array.isArray(t.preferred_days) ? t.preferred_days : [],
});

const arraysEq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const lanesEq = (a: PreferredLane[], b: PreferredLane[]) =>
  a.length === b.length &&
  a.every((l, i) =>
    l.origin_city === b[i].origin_city &&
    l.origin_state === b[i].origin_state &&
    l.dest_city === b[i].dest_city &&
    l.dest_state === b[i].dest_state,
  );

export const routesEqual = (a: RoutesValue, b: RoutesValue): boolean =>
  a.operation_type === b.operation_type &&
  arraysEq(a.preferred_days, b.preferred_days) &&
  arraysEq(a.operating_states, b.operating_states) &&
  arraysEq(a.avoid_states, b.avoid_states) &&
  lanesEq(a.preferred_lanes, b.preferred_lanes);

// Strip empty lane rows on save so the JSON column never gets blank objects.
export const serializeRoutes = (v: RoutesValue) => {
  const cleanLanes = v.preferred_lanes.filter(
    (l) => l.origin_city.trim() || l.origin_state.trim() || l.dest_city.trim() || l.dest_state.trim(),
  );
  return {
    operation_type: v.operation_type || null,
    preferred_lanes: cleanLanes.length ? cleanLanes : null,
    operating_states: v.operating_states.length ? v.operating_states : null,
    avoid_states: v.avoid_states.length ? v.avoid_states : null,
    preferred_days: v.preferred_days.length ? v.preferred_days : null,
  };
};

interface Props {
  value: RoutesValue;
  onChange: (next: RoutesValue) => void;
  /** Render the "Routes & Availability" heading. Default true. */
  showHeading?: boolean;
}

export default function RoutesAndAvailabilityFields({ value, onChange, showHeading = true }: Props) {
  const toggle = (field: "preferred_days" | "operating_states" | "avoid_states", item: string) => {
    const arr = value[field];
    const has = arr.includes(item);
    onChange({ ...value, [field]: has ? arr.filter((x) => x !== item) : [...arr, item] });
  };

  const addLane = () => onChange({
    ...value,
    preferred_lanes: [...value.preferred_lanes, { origin_city: "", origin_state: "", dest_city: "", dest_state: "" }],
  });
  const updateLane = (idx: number, field: keyof PreferredLane, v: string) => onChange({
    ...value,
    preferred_lanes: value.preferred_lanes.map((l, i) => (i === idx ? { ...l, [field]: v } : l)),
  });
  const removeLane = (idx: number) => onChange({
    ...value,
    preferred_lanes: value.preferred_lanes.filter((_, i) => i !== idx),
  });

  return (
    <div>
      {showHeading && (
        <h5 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">
          Routes &amp; Availability
        </h5>
      )}

      <div className="mb-4">
        <Select
          label="Operation Type"
          value={value.operation_type}
          onChange={(e) => onChange({ ...value, operation_type: e.target.value })}
          options={OPERATION_TYPE_OPTIONS}
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono text-txt-light uppercase">Preferred Lanes</div>
          <button type="button" onClick={addLane} className="text-[11px] text-blue font-semibold hover:underline">
            + Add Lane
          </button>
        </div>
        {value.preferred_lanes.length === 0 ? (
          <div className="text-[11px] text-txt-light italic">No lanes yet. Click &quot;+ Add Lane&quot; to add one.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {value.preferred_lanes.map((lane, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_18px_1fr_70px_24px] gap-2 items-end">
                <Input
                  label={idx === 0 ? "Origin City" : undefined}
                  value={lane.origin_city}
                  placeholder="Dallas"
                  onChange={(e) => updateLane(idx, "origin_city", e.target.value)}
                />
                <Select
                  label={idx === 0 ? "ST" : undefined}
                  value={lane.origin_state}
                  onChange={(e) => updateLane(idx, "origin_state", e.target.value)}
                  options={stateSelectOptions}
                />
                <div className="text-txt-light text-center pb-2">→</div>
                <Input
                  label={idx === 0 ? "Destination City" : undefined}
                  value={lane.dest_city}
                  placeholder="Atlanta"
                  onChange={(e) => updateLane(idx, "dest_city", e.target.value)}
                />
                <Select
                  label={idx === 0 ? "ST" : undefined}
                  value={lane.dest_state}
                  onChange={(e) => updateLane(idx, "dest_state", e.target.value)}
                  options={stateSelectOptions}
                />
                <button
                  type="button"
                  onClick={() => removeLane(idx)}
                  className="text-red text-base pb-1.5 hover:opacity-70"
                  title="Remove lane"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-mono text-txt-light uppercase mb-2">
          Operating States <span className="text-txt-light/70 normal-case font-sans">(will run in)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {US_STATES.map((s) => {
            const checked = value.operating_states.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle("operating_states", s)}
                className={`px-2 py-1 border rounded text-[11px] font-mono cursor-pointer transition-colors
                  ${checked ? "border-blue bg-blue/10 text-blue font-semibold" : "border-border text-txt-mid hover:bg-surface-mid"}`}
              >
                {s}
              </button>
            );
          })}
        </div>
        <div className="text-[9px] font-mono text-txt-light/70 uppercase tracking-wide mt-3 mb-1.5">Canada</div>
        <div className="flex flex-wrap gap-1.5">
          {CA_PROVINCES.map((p) => {
            const checked = value.operating_states.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle("operating_states", p)}
                className={`px-2 py-1 border rounded text-[11px] font-mono cursor-pointer transition-colors
                  ${checked ? "border-blue bg-blue/10 text-blue font-semibold" : "border-border text-txt-mid hover:bg-surface-mid"}`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-mono text-txt-light uppercase mb-2">
          Avoid States <span className="text-txt-light/70 normal-case font-sans">(hard &quot;no&quot;)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {US_STATES.map((s) => {
            const checked = value.avoid_states.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle("avoid_states", s)}
                className={`px-2 py-1 border rounded text-[11px] font-mono cursor-pointer transition-colors
                  ${checked ? "border-red bg-red/10 text-red font-semibold" : "border-border text-txt-mid hover:bg-surface-mid"}`}
              >
                {s}
              </button>
            );
          })}
        </div>
        <div className="text-[9px] font-mono text-txt-light/70 uppercase tracking-wide mt-3 mb-1.5">Canada</div>
        <div className="flex flex-wrap gap-1.5">
          {CA_PROVINCES.map((p) => {
            const checked = value.avoid_states.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle("avoid_states", p)}
                className={`px-2 py-1 border rounded text-[11px] font-mono cursor-pointer transition-colors
                  ${checked ? "border-red bg-red/10 text-red font-semibold" : "border-border text-txt-mid hover:bg-surface-mid"}`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Preferred Days</div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((opt) => {
            const checked = value.preferred_days.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle("preferred_days", opt.value)}
                className={`px-3 py-1.5 border rounded-md text-xs cursor-pointer transition-colors
                  ${checked ? "border-blue bg-blue/5 text-blue font-semibold" : "border-border text-txt-mid hover:bg-surface-mid"}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
