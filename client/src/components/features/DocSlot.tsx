"use client";

import { useRef, useState } from "react";
import type { TruckerDocument } from "@/types";
import { apiFetch } from "@/lib/api";

const docTooltips: Record<string, string> = {
  void_cheque: "Required if using Quick Pay",
};

export default function DocSlot({
  doc,
  truckerId,
  onUpload,
}: {
  doc: TruckerDocument;
  truckerId: string;
  onUpload?: (typeSlug: string, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState(false);

  const handleView = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/truckers/${truckerId}/documents/${doc.type_slug}/url`
      );
      window.open(url, "_blank");
    } catch {
      // silently fail — user can retry
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className={`border rounded-md p-3 min-w-0 ${
        doc.uploaded
          ? "border-green/40 bg-green-bg/40"
          : "border-border bg-white"
      }`}
      title={docTooltips[doc.type_slug]}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-txt truncate">{doc.type_label}</span>
        {doc.required && (
          <span className="text-[9px] font-mono text-red uppercase shrink-0 ml-1">Required</span>
        )}
      </div>
      {doc.uploaded ? (
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[11px] text-green font-mono shrink-0">&#x2713;</span>
          <span className="text-[11px] text-green font-mono truncate" title={doc.file_name || ""}>
            {doc.file_name}
          </span>
          <button
            onClick={handleView}
            disabled={opening}
            className="shrink-0 ml-auto text-blue hover:text-blue-light disabled:opacity-50"
            title="View / Download"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <span className="text-txt-light text-[10px] shrink-0">
            {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ""}
          </span>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload?.(doc.type_slug, file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="text-[11px] text-blue hover:text-blue-light font-mono underline cursor-pointer"
          >
            Upload Document
          </button>
        </>
      )}
    </div>
  );
}
