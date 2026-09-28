"use client";

import { SelectHTMLAttributes, forwardRef, useId } from "react";
import InfoTip from "./InfoTip";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  tooltip?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, tooltip, className = "", id, ...props }, ref) => {
  // See Input.tsx — an unassociated label is decorative only.
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-[5px]">
      {label && (
        <label htmlFor={selectId} className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
          {label}
          {tooltip && <InfoTip text={tooltip} />}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        className={`px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white font-sans
          focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10 ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
});

Select.displayName = "Select";
export default Select;
