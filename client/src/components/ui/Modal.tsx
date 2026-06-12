"use client";

import { useEffect, useRef } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  width = "480px",
  closeOnOverlay = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  // When false, clicking the dimmed background no longer closes the modal —
  // only the X button (or an in-modal Cancel) will. Use for forms that
  // would lose unsaved input on an accidental backdrop click.
  closeOnOverlay?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (closeOnOverlay && e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-h-[90vh] flex flex-col"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          <button onClick={onClose} className="text-txt-light hover:text-txt text-lg cursor-pointer">
            &times;
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
