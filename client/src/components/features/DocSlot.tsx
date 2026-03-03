"use client";

import type { TruckerDocument } from "@/types";

export default function DocSlot({
  doc,
  onUpload,
}: {
  doc: TruckerDocument;
  onUpload?: (typeSlug: string) => void;
}) {
  return (
    <div
      className={`border rounded-md p-3 ${
        doc.uploaded
          ? "border-green/40 bg-green-bg/40"
          : "border-border bg-white"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-txt">{doc.type_label}</span>
        {doc.required && (
          <span className="text-[9px] font-mono text-red uppercase">Required</span>
        )}
      </div>
      {doc.uploaded ? (
        <div className="text-[11px] text-green font-mono flex items-center gap-1">
          <span>&#x2713;</span> {doc.file_name}
          <span className="text-txt-light ml-auto text-[10px]">
            {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ""}
          </span>
        </div>
      ) : (
        <button
          onClick={() => onUpload?.(doc.type_slug)}
          className="text-[11px] text-blue hover:text-blue-light font-mono underline cursor-pointer"
        >
          Upload Document
        </button>
      )}
    </div>
  );
}
