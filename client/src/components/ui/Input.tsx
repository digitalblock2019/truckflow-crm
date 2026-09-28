"use client";

import { InputHTMLAttributes, forwardRef, useId } from "react";
import InfoTip from "./InfoTip";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  locked?: boolean;
  tooltip?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, locked, tooltip, className = "", id, ...props }, ref) => {
  // Without htmlFor/id the label is decorative: screen readers don't announce
  // it and clicking it doesn't focus the field. Falls back to a generated id
  // so callers don't have to supply one.
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-[5px]">
      {label && (
        <label htmlFor={inputId} className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
          {label}
          {tooltip && <InfoTip text={tooltip} />}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={`px-3 py-2 border rounded-[5px] text-[13px] text-txt bg-white font-sans
          focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10
          ${locked ? "bg-surface text-txt-light cursor-not-allowed border-dashed" : "border-border"}
          ${className}`}
        readOnly={locked}
        {...props}
      />
    </div>
  );
});

Input.displayName = "Input";
export default Input;
