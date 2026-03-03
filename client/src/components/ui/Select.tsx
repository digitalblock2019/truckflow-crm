"use client";

import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className = "", ...props }, ref) => (
    <div className="flex flex-col gap-[5px]">
      {label && (
        <label className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={`px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white font-sans
          focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10 ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
);

Select.displayName = "Select";
export default Select;
