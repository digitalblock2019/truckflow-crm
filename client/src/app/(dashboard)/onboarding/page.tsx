"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import DocSlot from "@/components/features/DocSlot";
import { useTruckers, useTruckerDocuments, useUploadDocument } from "@/lib/hooks";
import type { Trucker } from "@/types";

export default function OnboardingPage() {
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: truckersData, isLoading } = useTruckers({ status: "onboarded", limit: 50 });
  const truckers = (truckersData?.data ?? []) as Trucker[];
  const { data: docs } = useTruckerDocuments(selectedId);
  const uploadDoc = useUploadDocument();

  const selected = truckers.find((t) => t.id === selectedId);

  // Calculate onboarding progress from docs
  const docsArr = docs ?? [];
  const uploadedCount = docsArr.filter((d) => d.uploaded).length;
  const progress = docsArr.length > 0 ? Math.round((uploadedCount / docsArr.length) * 100) : 0;

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
                <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">
                  Document Checklist
                </h4>
                <div className="grid grid-cols-3 gap-2.5">
                  {docsArr.map((doc) => (
                    <DocSlot
                      key={doc.type_slug}
                      doc={doc}
                      onUpload={(slug) =>
                        uploadDoc.mutate({
                          truckerId: selected.id,
                          typeSlug: slug,
                          fileName: `${slug}_${Date.now()}.pdf`,
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
