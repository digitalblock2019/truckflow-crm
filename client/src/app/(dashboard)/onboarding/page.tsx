"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import DocSlot from "@/components/features/DocSlot";
import Button from "@/components/ui/Button";
import { useTruckers, useTruckerDocuments, useUploadDocument, useMarkFullyOnboarded, useUpdateTrucker } from "@/lib/hooks";
import type { Trucker } from "@/types";

export default function OnboardingPage() {
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: truckersData, isLoading } = useTruckers({ status: "onboarded", limit: 50 });
  const truckers = (truckersData?.data ?? []) as Trucker[];
  const { data: docs } = useTruckerDocuments(selectedId);
  const uploadDoc = useUploadDocument();
  const markOnboarded = useMarkFullyOnboarded();
  const updateTrucker = useUpdateTrucker();

  const selected = truckers.find((t) => t.id === selectedId);

  // Calculate onboarding progress from docs
  const docsArr = docs ?? [];
  const uploadedCount = docsArr.filter((d) => d.uploaded).length;
  const progress = docsArr.length > 0 ? Math.round((uploadedCount / docsArr.length) * 100) : 0;
  const allRequiredUploaded = docsArr.filter((d) => d.required).every((d) => d.uploaded);

  return (
    <>
      <Topbar title="Onboarding" subtitle="Track trucker onboarding progress and documents" />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <div className="grid grid-cols-[340px_1fr] gap-4">
          <Card className="!p-0 max-h-[calc(100vh-140px)] overflow-y-auto">
            <div className="bg-navy px-4 py-4 rounded-t-xl">
              <h3 className="text-sm font-bold text-white tracking-wide">Onboarding Queue</h3>
              <p className="text-[11px] text-white/60 mt-0.5">{truckers.length} truckers</p>
            </div>
            {isLoading ? (
              <div className="p-4 text-xs text-txt-light">Loading...</div>
            ) : truckers.length === 0 ? (
              <div className="p-4 text-xs text-txt-light text-center">No truckers in onboarding</div>
            ) : (
              truckers.map((t) => {
                const tDocsUploaded = (t as any).docs_uploaded ?? null;
                const tDocsRequired = (t as any).docs_required ?? null;
                const hasDocInfo = tDocsRequired !== null && tDocsRequired > 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[#f0f2f5] cursor-pointer transition-colors
                      ${t.id === selectedId ? "bg-[#f0f6ff]" : "hover:bg-[#f8faff]"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-txt">{t.legal_name}</span>
                      <Badge color="blue">{t.status_system?.replace(/_/g, " ") ?? "—"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-txt-light font-mono">{t.mc_number}</span>
                      {hasDocInfo && (
                        <span className="text-[10px] text-txt-mid font-mono">
                          {tDocsUploaded}/{tDocsRequired} docs
                        </span>
                      )}
                    </div>
                    {hasDocInfo && (
                      <div className="mt-1.5 bg-surface-mid rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-green rounded-full transition-[width] duration-300"
                          style={{ width: `${Math.round((tDocsUploaded / tDocsRequired) * 100)}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </Card>

          <div>
            {selected ? (
              <Card>
                <CardHeader
                  title={selected.legal_name}
                  subtitle={`MC# ${selected.mc_number}`}
                />
                {docsArr.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-txt-mid">{progress}% complete</span>
                      <span className="text-[10px] text-txt-light">({uploadedCount}/{docsArr.length} docs)</span>
                    </div>
                    <ProgressBar value={progress} className="mb-5" />
                  </>
                )}
                {/* Conditional flags */}
                <div className="flex flex-wrap gap-4 mb-4 p-3 bg-surface-mid rounded-lg">
                  {([
                    { key: "uses_factoring", label: "Uses Factoring" },
                    { key: "is_new_authority", label: "New Authority" },
                    { key: "uses_quick_pay", label: "Uses Quick Pay" },
                  ] as const).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!(selected as any)[key]}
                        onClick={() => {
                          updateTrucker.mutate({
                            id: selected.id,
                            [key]: !(selected as any)[key],
                          } as any);
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          (selected as any)[key] ? "bg-blue" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            (selected as any)[key] ? "translate-x-[18px]" : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                      <span className="text-txt-mid">{label}</span>
                    </label>
                  ))}
                </div>

                <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">
                  Document Checklist
                </h4>
                <div className="grid grid-cols-3 gap-2.5">
                  {docsArr.map((doc) => (
                    <DocSlot
                      key={doc.type_slug}
                      doc={doc}
                      truckerId={selected.id}
                      onUpload={(slug, file) =>
                        uploadDoc.mutate({
                          truckerId: selected.id,
                          typeSlug: slug,
                          file,
                        })
                      }
                    />
                  ))}
                </div>
                {docsArr.length === 0 && (
                  <div className="text-xs text-txt-light py-8 text-center">
                    No document types configured for this trucker
                  </div>
                )}

                {/* Mark as Fully Onboarded */}
                <div className="mt-5 pt-4 border-t border-border">
                  <Button
                    onClick={() => {
                      markOnboarded.mutate(selected.id, {
                        onSettled: () => setSelectedId(""),
                      });
                    }}
                    disabled={markOnboarded.isPending || !allRequiredUploaded}
                    className={`w-full ${allRequiredUploaded ? "!bg-green !border-green hover:!bg-green/90" : "!bg-green/50 !border-green/50 !cursor-not-allowed"}`}
                  >
                    {markOnboarded.isPending ? "Marking..." : "Mark as Fully Onboarded"}
                  </Button>
                  {!allRequiredUploaded && docsArr.length > 0 && (
                    <p className="text-[10px] text-txt-light mt-1.5 text-center">
                      {docsArr.filter((d) => d.required && !d.uploaded).length} required document(s) still missing
                    </p>
                  )}
                  {allRequiredUploaded && progress < 100 && docsArr.length > 0 && (
                    <p className="text-[10px] text-txt-light mt-1.5 text-center">
                      {docsArr.length - uploadedCount} optional document(s) remaining
                    </p>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="flex items-center justify-center h-64">
                <div className="text-sm text-txt-light">
                  Select a trucker from the list to view documents
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
