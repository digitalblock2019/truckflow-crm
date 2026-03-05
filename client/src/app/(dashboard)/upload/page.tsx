"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Topbar from "@/components/layout/Topbar";
import UploadZone from "@/components/ui/UploadZone";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import { useImportTruckers, useTruckerBatches } from "@/lib/hooks";

interface ParsedRow {
  [key: string]: string;
}

interface ImportResult {
  batch_id: string;
  rows_added: number;
  rows_skipped: number;
  rows_errored: number;
}

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

// Map file columns to API field names
const columnMap: Record<string, string> = {
  MC: "mc_number",
  USDOT: "dot_number",
  LegalName: "legal_name",
  DBA: "dba_name",
  Phone: "phone",
  Email: "email",
  PhysicalAddress: "physical_address",
  PowerUnits: "power_units",
  Drivers: "drivers",
  EntityType: "entity_type",
  OperationClass: "operation_class",
  OperatingStatus: "operating_status",
  mc_number: "mc_number",
  dot_number: "dot_number",
  legal_name: "legal_name",
  dba_name: "dba_name",
  phone: "phone",
  email: "email",
  physical_address: "physical_address",
};

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importMut = useImportTruckers();
  const { data: batches } = useTruckerBatches();

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

  const handleImport = () => {
    const mapped = rows.map((row) => {
      const out: ParsedRow = {};
      for (const [fileCol, val] of Object.entries(row)) {
        const apiField = columnMap[fileCol] || columnMap[fileCol.trim()];
        if (apiField) out[apiField] = val;
      }
      if (!out.state && out.physical_address) {
        const parts = out.physical_address.split(",").map((s) => s.trim());
        const last = parts[parts.length - 1] || "";
        const stateMatch = last.match(/^([A-Z]{2})/);
        if (stateMatch) out.state = stateMatch[1];
      }
      return out;
    });
    importMut.mutate({ rows: mapped, filename: file?.name }, {
      onSuccess: (data) => {
        setImportResult(data as unknown as ImportResult);
      },
    });
  };

  const handleReset = () => {
    setFile(null);
    setRows([]);
    setHeaders([]);
    setImportResult(null);
    importMut.reset();
  };

  // Success screen
  if (importResult) {
    return (
      <>
        <Topbar title="Upload Truck Data" subtitle="Import trucker records from CSV or Excel" />
        <div className="flex-1 overflow-y-auto p-6 bg-surface">
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
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
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
                          <button
                            onClick={() => router.push(`/truckers?batch=${b.id}`)}
                            className="text-blue hover:underline text-xs font-medium"
                          >
                            View Records
                          </button>
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
                    <Button onClick={handleImport} disabled={importMut.isPending}>
                      {importMut.isPending ? "Importing..." : `Import ${rows.length} Records`}
                    </Button>
                  </div>
                }
              />
              {importMut.isError && (
                <div className="bg-red-bg border border-red/30 rounded-md px-3 py-2 mb-4 text-xs text-red">
                  {importMut.error?.message || "Import failed"}
                </div>
              )}
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
