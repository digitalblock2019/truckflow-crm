import { apiFetch } from "@/lib/api";
import type { LoadDocument } from "@/types";

const STEPS = [
  { key: "pending", label: "Pending", docType: null, docLabel: null },
  { key: "dispatched", label: "Dispatched", docType: "rate_con", docLabel: "Rate Confirmation" },
  { key: "in_transit", label: "In Transit", docType: "bol", docLabel: "Bill of Lading" },
  { key: "delivered", label: "Delivered", docType: "pod", docLabel: "Proof of Delivery" },
  { key: "payment_received", label: "Paid", docType: "receipt", docLabel: "Receipt / Proof of Payment" },
];

interface Props {
  status: string;
  docs: LoadDocument[];
  loadId: string;
  onUpload: (docType: string, file: File) => void;
}

export default function LoadPipeline({ status, docs, loadId, onUpload }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="relative pl-4 mb-4">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        const future = i > currentIdx;
        const isLast = i === STEPS.length - 1;

        const doc = step.docType
          ? docs.find((d) => d.doc_type === step.docType) ?? null
          : null;

        const fileInputId = `timeline-doc-${step.key}`;

        return (
          <div key={step.key} className="relative flex items-start gap-3 pb-4">
            {/* Vertical line */}
            {!isLast && (
              <div
                className={`absolute left-[7px] top-[18px] w-[2px] bottom-0 ${
                  done ? "bg-green" : "bg-border"
                }`}
              />
            )}

            {/* Circle indicator */}
            <div className="relative z-10 flex-shrink-0 mt-0.5">
              {done ? (
                <div className="w-4 h-4 rounded-full bg-green flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : current ? (
                <div className="w-4 h-4 rounded-full bg-blue border-2 border-blue">
                  <div className="w-full h-full rounded-full bg-blue" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-border bg-surface" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div
                className={`text-[11px] font-mono uppercase tracking-wide ${
                  done ? "text-green font-semibold" : ""
                }${current ? "text-blue font-bold" : ""}${
                  future ? "text-txt-light" : ""
                }`}
              >
                {step.label}
                {current && (
                  <span className="ml-1.5 text-[9px] font-normal text-blue/70">(current)</span>
                )}
              </div>

              {/* Document slot */}
              {step.docType && (
                <div className="mt-1.5">
                  {doc?.uploaded ? (
                    <div className="flex items-center gap-2 text-[10px] bg-surface-mid rounded px-2 py-1.5">
                      <span className="text-txt-mid font-medium truncate" title={doc.file_name ?? ""}>
                        {step.docLabel}: {doc.file_name}
                      </span>
                      {doc.uploaded_at && (
                        <span className="text-txt-light whitespace-nowrap">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </span>
                      )}
                      <div className="flex gap-1 ml-auto whitespace-nowrap">
                        <button
                          onClick={async () => {
                            try {
                              const { url } = await apiFetch<{ url: string }>(
                                `/api/loads/${loadId}/documents/${step.docType}/url`
                              );
                              window.open(url, "_blank");
                            } catch {}
                          }}
                          className="text-blue hover:underline cursor-pointer"
                        >
                          Download
                        </button>
                        <span className="text-txt-light">|</span>
                        <label htmlFor={fileInputId} className="text-blue hover:underline cursor-pointer">
                          Replace
                        </label>
                      </div>
                      <input
                        id={fileInputId}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUpload(step.docType!, f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] mt-0.5">
                      <span className="text-txt-light">
                        {step.docLabel}
                        {step.key === "payment_received" ? " (optional)" : ""}:
                      </span>
                      <label
                        htmlFor={fileInputId}
                        className="inline-block px-2.5 py-1 text-[10px] font-semibold text-blue border border-blue/30 rounded hover:bg-blue/5 cursor-pointer transition-colors"
                      >
                        Upload
                      </label>
                      <input
                        id={fileInputId}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUpload(step.docType!, f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
