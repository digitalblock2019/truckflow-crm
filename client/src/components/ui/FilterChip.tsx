"use client";

export default function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-[5px] border rounded px-2.5 py-1 text-[11px] cursor-pointer transition-all duration-100
        ${active
          ? "bg-[#dbeafe] border-[#93c5fd] text-blue"
          : "bg-surface border-border text-txt-mid hover:bg-surface-mid"
        }`}
    >
      {label}
    </button>
  );
}
