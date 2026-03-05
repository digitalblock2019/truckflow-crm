"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import Topbar from "@/components/layout/Topbar";
import UploadZone from "@/components/ui/UploadZone";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import { useImportTruckers } from "@/lib/hooks";

interface ParsedRow {
  [key: string]: string;
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

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const importMut = useImportTruckers();

  const handleFile = async (f: File) => {
    setFile(f);
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
    // Direct matches (already correct field names pass through)
    mc_number: "mc_number",
    dot_number: "dot_number",
    legal_name: "legal_name",
    dba_name: "dba_name",
    phone: "phone",
    email: "email",
    physical_address: "physical_address",
  };

  const handleImport = () => {
    const mapped = rows.map((row) => {
      const out: ParsedRow = {};
      for (const [fileCol, val] of Object.entries(row)) {
        const apiField = columnMap[fileCol] || columnMap[fileCol.trim()];
        if (apiField) out[apiField] = val;
      }
      // Extract state from physical address if not present
      if (!out.state && out.physical_address) {
        const parts = out.physical_address.split(",").map((s) => s.trim());
        const last = parts[parts.length - 1] || "";
        const stateMatch = last.match(/^([A-Z]{2})/);
        if (stateMatch) out.state = stateMatch[1];
      }
      return out;
    });
    importMut.mutate(mapped, {
      onSuccess: () => {
        setFile(null);
        setRows([]);
        setHeaders([]);
      },
    });
  };

  return (
    <>
      <Topbar title="Upload Truck Data" subtitle="Import trucker records from CSV or Excel" />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {!file ? (
          <Card>
            <CardHeader title="Upload File" subtitle="Drag and drop a CSV file or click to browse" />
            <UploadZone onFile={handleFile} accept=".csv,.xlsx,.xls" />
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                title={`Preview: ${file.name}`}
                subtitle={`${rows.length} rows detected`}
                action={
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setFile(null); setRows([]); setHeaders([]); }}>
                      Cancel
                    </Button>
                    <Button onClick={handleImport} disabled={importMut.isPending}>
                      {importMut.isPending ? "Importing..." : `Import ${rows.length} Records`}
                    </Button>
                  </div>
                }
              />
              {importMut.isSuccess && (
                <div className="bg-green-bg border border-green/30 rounded-md px-3 py-2 mb-4 text-xs text-green">
                  Import complete! Added: {(importMut.data as any)?.rows_added ?? 0}, Skipped (duplicates): {(importMut.data as any)?.rows_skipped ?? 0}, Errors: {(importMut.data as any)?.rows_errored ?? 0}
                </div>
              )}
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
