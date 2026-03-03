"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  locked?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, locked, className = "", ...props }, ref) => (
    <div className="flex flex-col gap-[5px]">
      {label && (
        <label className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`px-3 py-2 border rounded-[5px] text-[13px] text-txt bg-white font-sans
          focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10
          ${locked ? "bg-surface text-txt-light cursor-not-allowed border-dashed" : "border-border"}
          ${className}`}
        readOnly={locked}
        {...props}
      />
    </div>
  )
);

Input.displayName = "Input";
export default Input;
