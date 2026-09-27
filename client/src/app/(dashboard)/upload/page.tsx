"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Topbar from "@/components/layout/Topbar";
import UploadZone from "@/components/ui/UploadZone";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { useImportTruckers, useTruckerBatches, useDeleteBatch, useCheckImportDuplicates, type ImportDuplicate } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";

interface ParsedRow {
  [key: string]: string;
}

interface ImportResult {
  batch_id: string;
  rows_added: number;
  rows_skipped: number;
  rows_errored: number;
  rows_updated: number;
}

// What the file represents, which decides the status imported rows land on.
// CarrierVault scrapes are raw leads; the other two are one-off migrations of
// the Google Sheets the team tracked interested/sleeping leads in.
const DATA_TYPES = [
  { value: "imported", label: "New Leads (CarrierVault)", hint: "Raw scraped leads — land in the Imported tab, nobody has contacted them yet." },
  { value: "interested", label: "Interested Leads (sheet migration)", hint: "Leads who reply actively — land in the Interested tab." },
  { value: "sleeping_lead", label: "Sleeping Leads (sheet migration)", hint: "Leads who reply slowly or intermittently — land in the Sleeping Leads tab." },
];

// Fields worth showing side by side when deciding which version of a record
// to keep. Anything not listed here is left untouched by the import either way.
const COMPARE_FIELDS: { key: string; label: string }[] = [
  { key: "legal_name", label: "Legal Name" },
  { key: "dba_name", label: "DBA" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "state", label: "State" },
  { key: "physical_address", label: "Address" },
  { key: "dot_number", label: "DOT#" },
  { key: "power_units", label: "Power Units" },
];

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const rows = lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

function parseXlsx(buffer: ArrayBuffer): { headers: string[]; rows: ParsedRow[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!json.length) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  const rows = json.map((r) => {
    const row: ParsedRow = {};
    headers.forEach((h) => { row[h] = String(r[h] ?? ""); });
    return row;
  });
  return { headers, rows };
}

// Normalize a header for lookup: lowercase + drop non-alphanumeric. Lets us
// match "Phone No.", "phone_number", "Phone#" etc. all to the same canonical key.
const normalizeHeader = (s: string): string =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Multiple normalized aliases can map to one API field. The first column in the
// file whose normalized form matches any entry here wins for that API field.
const HEADER_ALIASES: Record<string, string> = {
  // mc_number
  mc: "mc_number",
  mcnumber: "mc_number",
  mcmxff: "mc_number",
  mcmxffnumber: "mc_number",
  motorcarrier: "mc_number",
  // dot_number
  usdot: "dot_number",
  usdotnumber: "dot_number",
  dot: "dot_number",
  dotnumber: "dot_number",
  // legal_name
  legalname: "legal_name",
  companyname: "legal_name",
  carrier: "legal_name",
  carriername: "legal_name",
  // dba_name
  dba: "dba_name",
  dbaname: "dba_name",
  doingbusinessas: "dba_name",
  // phone
  phone: "phone",
  phoneno: "phone",
  phonenumber: "phone",
  mobile: "phone",
  contact: "phone",
  // email
  email: "email",
  emailaddress: "email",
  // physical_address
  physicaladdress: "physical_address",
  address: "physical_address",
  // power_units
  powerunits: "power_units",
  trucks: "power_units",
  units: "power_units",
  // drivers
  drivers: "drivers",
  drivercount: "drivers",
  // FMCSA enums (entity_type, operation_class, operating_status)
  entitytype: "entity_type",
  operationclass: "operation_class",
  operatingstatus: "operating_status",
  operatingauthoritystatus: "operating_status",
};

const apiFieldForHeader = (header: string): string | null =>
  HEADER_ALIASES[normalizeHeader(header)] ?? null;

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [targetStatus, setTargetStatus] = useState<string>("imported");
  // Duplicate-resolution state. `pendingRows` holds the mapped rows while the
  // user decides what to do about collisions, so the import can resume with
  // their answers without re-parsing the file.
  const [duplicates, setDuplicates] = useState<ImportDuplicate[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, "crm" | "sheet">>({});
  const [pendingRows, setPendingRows] = useState<ParsedRow[] | null>(null);
  const [dupIndex, setDupIndex] = useState(0);
  const importMut = useImportTruckers();
  const checkDupsMut = useCheckImportDuplicates();
  const { data: batches } = useTruckerBatches();
  const deleteBatchMut = useDeleteBatch();
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = role === "admin" || role === "supervisor";

  const handleFile = async (f: File) => {
    setFile(f);
    setImportResult(null);
    importMut.reset();
    const isExcel = f.name.endsWith(".xlsx") || f.name.endsWith(".xls");
    let result: { headers: string[]; rows: ParsedRow[] };
    if (isExcel) {
      const buffer = await f.arrayBuffer();
      result = parseXlsx(buffer);
    } else {
      const text = await f.text();
      result = parseCsv(text);
    }
    setHeaders(result.headers);
    setRows(result.rows);
  };

  // Build the file-header -> api-field mapping once per file so we can both
  // (a) preview it to the user before they hit Import, and (b) reuse it inside
  // the per-row mapper. Phone is digit-only-cleaned so dup checks line up with
  // scraper output regardless of whether the source had (123) 456-7890 or 1234567890.
  const fileFieldMapping = useMemo<{ file: string; api: string | null }[]>(
    () => headers.map((h) => ({ file: h, api: apiFieldForHeader(h) })),
    [headers],
  );
  const cleanPhone = (v: string): string => String(v ?? "").replace(/\D/g, "");

  const buildMappedRows = (): ParsedRow[] => {
    return rows.map((row) => {
      const out: ParsedRow = {};
      for (const [fileCol, val] of Object.entries(row)) {
        const apiField = apiFieldForHeader(fileCol);
        if (!apiField) continue;
        // Don't clobber a real value with a blank from a later alias collision.
        const cleaned = apiField === "phone" ? cleanPhone(String(val)) : String(val ?? "").trim();
        if (cleaned === "" && out[apiField]) continue;
        out[apiField] = cleaned;
      }
      if (!out.state && out.physical_address) {
        const parts = out.physical_address.split(",").map((s) => s.trim());
        const last = parts[parts.length - 1] || "";
        const stateMatch = last.match(/^([A-Z]{2})/);
        if (stateMatch) out.state = stateMatch[1];
      }
      return out;
    });
  };

  // Step 1 — look for collisions before writing anything. If the file only
  // contains MC#s we've never seen, skip the modal entirely and just import.
  const handleImport = async () => {
    const mapped = buildMappedRows();
    try {
      const { duplicates: found } = await checkDupsMut.mutateAsync({ rows: mapped });
      if (found.length === 0) {
        await runImport(mapped, {});
        return;
      }
      setDuplicates(found);
      setResolutions({});
      setDupIndex(0);
      setPendingRows(mapped);
    } catch {
      // mutation error state already surfaces below
    }
  };

  // Step 2 — write. Chunk into batches of 500 rows; each chunk reuses the same
  // batch_id so the upload history shows one row, not N.
  const runImport = async (mapped: ParsedRow[], decisions: Record<string, "crm" | "sheet">) => {
    const CHUNK_SIZE = 500;
    const chunks: ParsedRow[][] = [];
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      chunks.push(mapped.slice(i, i + CHUNK_SIZE));
    }
    setChunkProgress({ done: 0, total: chunks.length });

    let batchId: string | undefined;
    let lastResult: ImportResult | null = null;
    let updatedTotal = 0;
    try {
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const res = await importMut.mutateAsync({
          rows: chunks[i],
          filename: file?.name,
          batch_id: batchId,
          is_last_chunk: isLast,
          target_status: targetStatus,
          resolutions: decisions,
        });
        batchId = res.batch_id;
        // rows_updated is per-chunk (not stored on the batch row), so sum it.
        updatedTotal += res.rows_updated ?? 0;
        lastResult = { ...res, rows_updated: updatedTotal } as unknown as ImportResult;
        setChunkProgress({ done: i + 1, total: chunks.length });
      }
      if (lastResult) setImportResult(lastResult);
    } catch {
      // mutation error state already surfaces below
    } finally {
      setChunkProgress(null);
    }
  };

  // Step 3 — user has answered every collision, apply their decisions.
  const applyResolutions = async (decisions: Record<string, "crm" | "sheet">) => {
    const mapped = pendingRows ?? [];
    setDuplicates([]);
    setPendingRows(null);
    await runImport(mapped, decisions);
  };

  const resolveAllRemaining = (choice: "crm" | "sheet") => {
    const next = { ...resolutions };
    for (const d of duplicates) {
      if (!next[d.mc_number]) next[d.mc_number] = choice;
    }
    applyResolutions(next);
  };

  const resolveCurrent = (choice: "crm" | "sheet") => {
    const current = duplicates[dupIndex];
    if (!current) return;
    const next = { ...resolutions, [current.mc_number]: choice };
    setResolutions(next);
    if (dupIndex + 1 < duplicates.length) {
      setDupIndex(dupIndex + 1);
    } else {
      applyResolutions(next);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRows([]);
    setHeaders([]);
    setImportResult(null);
    setDuplicates([]);
    setResolutions({});
    setPendingRows(null);
    setDupIndex(0);
    setTargetStatus("imported");
    importMut.reset();
    checkDupsMut.reset();
  };

  // Success screen
  if (importResult) {
    return (
      <>
        <Topbar title="Upload Truck Data" subtitle="Import trucker records from CSV or Excel" />
        <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface">
          <Card>
            <div className="text-center py-10">
              <div className="text-5xl mb-4">&#x2705;</div>
              <h2 className="text-xl font-semibold text-navy mb-2">Import Complete!</h2>
              <p className="text-sm text-txt-mid mb-6">
                File <span className="font-mono font-semibold">{file?.name}</span> has been processed.
              </p>
              <div className="flex justify-center gap-8 mb-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green">{importResult.rows_added}</div>
                  <div className="text-xs text-txt-light mt-1">Added</div>
                </div>
                {importResult.rows_updated > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue">{importResult.rows_updated}</div>
                    <div className="text-xs text-txt-light mt-1">Updated (existing)</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange">{importResult.rows_skipped}</div>
                  <div className="text-xs text-txt-light mt-1">Skipped (duplicates)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red">{importResult.rows_errored}</div>
                  <div className="text-xs text-txt-light mt-1">Errors</div>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={handleReset}>
                  Upload Another File
                </Button>
                <Button onClick={() => router.push(`/truckers?batch=${importResult.batch_id}`)}>
                  View Imported Truckers
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Upload Truck Data" subtitle="Import trucker records from CSV or Excel" />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface">
        {/* Duplicate resolution — these MC#s already exist in the CRM, so the
            user picks which version survives before anything is written.
            Bulk actions matter here: a sheet can collide on hundreds of rows
            and nobody will click through them one at a time. */}
        <Modal
          open={duplicates.length > 0}
          onClose={() => { setDuplicates([]); setPendingRows(null); setResolutions({}); setDupIndex(0); }}
          title="Existing records found"
          width="720px"
        >
          {duplicates[dupIndex] && (() => {
            const dup = duplicates[dupIndex];
            const crm = dup.crm as Record<string, unknown>;
            const incoming = dup.incoming as Record<string, string>;
            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-txt-mid">
                    MC# <span className="font-mono font-semibold">{dup.mc_number}</span> is already in the CRM.
                    Which version should be kept?
                  </p>
                  <span className="text-xs font-mono text-txt-light shrink-0 ml-3">
                    {dupIndex + 1} of {duplicates.length}
                  </span>
                </div>

                <div className="border border-border rounded-md overflow-hidden mb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface text-left text-txt-light">
                        <th className="px-3 py-2 font-medium w-[22%]">Field</th>
                        <th className="px-3 py-2 font-medium">In CRM</th>
                        <th className="px-3 py-2 font-medium">In sheet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARE_FIELDS.map((f) => {
                        const crmVal = crm[f.key] == null || crm[f.key] === "" ? "—" : String(crm[f.key]);
                        const sheetVal = !incoming[f.key] ? "—" : String(incoming[f.key]);
                        const differs = crmVal !== sheetVal;
                        return (
                          <tr key={f.key} className="border-t border-border">
                            <td className="px-3 py-1.5 text-txt-light">{f.label}</td>
                            <td className={`px-3 py-1.5 ${differs ? "bg-orange/10 font-medium" : ""}`}>{crmVal}</td>
                            <td className={`px-3 py-1.5 ${differs ? "bg-orange/10 font-medium" : ""}`}>{sheetVal}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-border">
                        <td className="px-3 py-1.5 text-txt-light">Status</td>
                        <td className="px-3 py-1.5" colSpan={2}>
                          <span className="font-mono">{String(crm.status_system ?? "—")}</span>
                          {" → "}
                          <span className="font-mono font-semibold">{targetStatus}</span>
                          <span className="text-txt-light"> (either way)</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => resolveCurrent("crm")}>Keep CRM record</Button>
                  <Button variant="secondary" onClick={() => resolveCurrent("sheet")}>Keep sheet record</Button>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() => resolveAllRemaining("crm")}
                      className="text-[11px] text-blue hover:underline"
                    >
                      Keep CRM for all remaining
                    </button>
                    <button
                      onClick={() => resolveAllRemaining("sheet")}
                      className="text-[11px] text-blue hover:underline"
                    >
                      Keep sheet for all remaining
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-txt-light">
                  Either choice moves the record into <span className="font-mono">{targetStatus}</span> and logs where it
                  came from in its status history. &ldquo;Keep CRM&rdquo; changes nothing else; &ldquo;Keep sheet&rdquo;
                  also overwrites the highlighted contact fields.
                </p>
              </div>
            );
          })()}
        </Modal>

        {/* Delete Batch Confirmation Modal */}
        <Modal
          open={!!deleteBatchId}
          onClose={() => { setDeleteBatchId(null); setDeleteConfirmText(""); }}
          title="Delete Import Batch"
          width="440px"
        >
          <div>
            <p className="text-sm text-txt-mid mb-4">
              This will permanently delete all trucker records from this import batch. This action cannot be undone.
            </p>
            <label className="text-xs font-mono text-txt-light uppercase block mb-1.5">
              Type <span className="font-bold text-red">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
              placeholder="Type DELETE here..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => { setDeleteBatchId(null); setDeleteConfirmText(""); }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleteConfirmText !== "DELETE" || deleteBatchMut.isPending}
                onClick={() => {
                  if (deleteBatchId && deleteConfirmText === "DELETE") {
                    deleteBatchMut.mutate(deleteBatchId, {
                      onSuccess: () => {
                        setDeleteBatchId(null);
                        setDeleteConfirmText("");
                      },
                    });
                  }
                }}
              >
                {deleteBatchMut.isPending ? "Deleting..." : "Delete Batch"}
              </Button>
            </div>
          </div>
        </Modal>

        {!file ? (
          <>
            <Card>
              <CardHeader title="Upload File" subtitle="Drag and drop a CSV or Excel file, or click to browse" />
              <UploadZone onFile={handleFile} accept=".csv,.xlsx,.xls" />
            </Card>

            {batches && batches.length > 0 && (
              <Card className="mt-4">
                <CardHeader title="Import History" subtitle="Previous imports" />
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#f8f9fb]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">File</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">Uploaded By</th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">Added</th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">Skipped</th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">Errors</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-[#f8faff]">
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5] text-txt whitespace-nowrap">
                          {new Date(b.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          <span className="text-txt-light ml-1.5">
                            {new Date(b.uploaded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5] text-txt font-mono">{b.filename}</td>
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5] text-txt">{b.uploaded_by_name || "—"}</td>
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5] text-center font-mono text-green font-semibold">{b.rows_added ?? 0}</td>
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5] text-center font-mono text-orange">{b.rows_skipped ?? 0}</td>
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5] text-center font-mono text-red">{b.rows_errored ?? 0}</td>
                        <td className="px-3 py-2.5 border-b border-[#f0f2f5]">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => router.push(`/truckers?batch=${b.id}`)}
                              className="text-blue hover:underline text-xs font-medium"
                            >
                              View Records
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => { setDeleteBatchId(b.id); setDeleteConfirmText(""); }}
                                className="text-red hover:underline text-xs font-medium"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card>
              <CardHeader
                title={`Preview: ${file.name}`}
                subtitle={`${rows.length} rows detected`}
                action={
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={handleReset}>
                      Cancel
                    </Button>
                    <Button onClick={handleImport} disabled={importMut.isPending || checkDupsMut.isPending}>
                      {chunkProgress
                        ? `Importing batch ${chunkProgress.done + (importMut.isPending ? 1 : 0)} of ${chunkProgress.total}...`
                        : checkDupsMut.isPending
                        ? "Checking for duplicates..."
                        : importMut.isPending
                        ? "Importing..."
                        : `Import ${rows.length} Records`}
                    </Button>
                  </div>
                }
              />

              <div className="mb-4 max-w-lg">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-txt-light mb-1">
                  Data type
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  {DATA_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-txt-light">
                  {DATA_TYPES.find((t) => t.value === targetStatus)?.hint}
                </div>
              </div>

              {(importMut.isError || checkDupsMut.isError) && (
                <div className="bg-red-bg border border-red/30 rounded-md px-3 py-2 mb-4 text-xs text-red">
                  {importMut.error?.message || checkDupsMut.error?.message || "Import failed"}
                </div>
              )}
            </Card>

            {/* Field Mapping preview — tells the user exactly which file columns
                will get imported and which will be silently dropped. Drives the
                fix where uploads "worked" but mc_number / phone / email were
                blank because the header didn't match the (previously) exact
                lookup table. */}
            <Card>
              <CardHeader
                title="Field Mapping"
                subtitle={(() => {
                  const matched = fileFieldMapping.filter((m) => m.api).length;
                  const total = fileFieldMapping.length;
                  return `${matched} of ${total} columns matched — unmatched columns will be ignored`;
                })()}
              />
              {!fileFieldMapping.some((m) => m.api === "mc_number") && (
                <div className="mb-3 px-3 py-2 bg-red-bg border border-red/30 rounded-md text-xs text-red">
                  ⚠ No column matched <span className="font-mono">mc_number</span>. The import will fail
                  for every row because MC# is required. Expected one of: MC, MC#, MC/MX/FF #, MC Number, mc_number.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#f8f9fb]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">
                        File Column
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">
                        →
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">
                        DB Field
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileFieldMapping.map(({ file, api }) => (
                      <tr key={file}>
                        <td className="px-3 py-2 border-b border-[#f0f2f5] font-mono text-txt">{file}</td>
                        <td className="px-3 py-2 border-b border-[#f0f2f5] text-txt-light">→</td>
                        <td className={`px-3 py-2 border-b border-[#f0f2f5] font-mono ${api ? "text-green" : "text-txt-light italic"}`}>
                          {api ?? "(ignored)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#f8f9fb]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border">
                        #
                      </th>
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide border-b border-border whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 border-b border-[#f0f2f5] text-txt-light">{i + 1}</td>
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-2 border-b border-[#f0f2f5] text-txt">
                            {row[h] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="px-3 py-2 text-xs text-txt-light">
                    Showing first 50 of {rows.length} rows
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
