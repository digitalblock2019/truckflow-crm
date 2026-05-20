"use client";

// Small "ⓘ" affordance next to a field label. Uses the native title attribute
// for the tooltip text so it can never be clipped by a scrolling modal or a
// transformed ancestor (a portal/CSS tooltip would risk both).
export default function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      tabIndex={0}
      className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
        border border-txt-light/50 text-txt-light text-[8px] font-bold leading-none
        cursor-help select-none align-middle"
    >
      i
    </span>
  );
}
