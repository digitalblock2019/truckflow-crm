"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Small "ⓘ" affordance next to a field label. The tooltip bubble is rendered
// via a portal to document.body with fixed positioning, so it can never be
// clipped by a scrolling modal or a transformed ancestor. All visual styles
// are inline for the same reason.
export default function InfoTip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        aria-label={text}
        className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
          border border-txt-light/50 text-txt-light text-[8px] font-bold leading-none
          cursor-help select-none align-middle"
      >
        i
      </span>
      {pos && typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translateX(-50%)",
              zIndex: 2147483647,
              maxWidth: 240,
              padding: "6px 10px",
              borderRadius: 6,
              backgroundColor: "#0f172a",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 400,
              lineHeight: 1.45,
              textTransform: "none",
              letterSpacing: 0,
              fontFamily: "system-ui, -apple-system, sans-serif",
              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
              pointerEvents: "none",
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
