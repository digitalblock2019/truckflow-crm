"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "accent" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-blue text-white hover:bg-blue-light",
  secondary: "bg-white text-txt border border-border hover:bg-surface",
  danger: "bg-red-bg text-red border border-red/30 hover:bg-red/10",
  accent: "bg-accent text-white hover:bg-accent-dim",
  ghost: "bg-transparent text-txt-mid border border-border hover:bg-surface",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3.5 py-[7px] text-xs",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-all duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = "Button";
export default Button;
