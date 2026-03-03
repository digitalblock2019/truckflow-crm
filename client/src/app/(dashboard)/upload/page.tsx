"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import UploadZone from "@/components/ui/UploadZone";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import { useImportTruckers } from "@/lib/hooks";

interface ParsedRow {
  [key: string]: string;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const importMut = useImportTruckers();

  const handleFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return;

    const hdrs = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    setHeaders(hdrs);

    const parsed = lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const row: ParsedRow = {};
      hdrs.forEach((h, i) => {
        row[h] = vals[i] ?? "";
      });
      return row;
    });
    setRows(parsed);
  };

  const handleImport = () => {
    importMut.mutate(rows, {
      onSuccess: () => {
        setFile(null);
        setRows([]);
        setHeaders([]);
      },
    });
  };

  return (
    <>
      <Topbar title="Upload Truck Data" subtitle="Import trucker records from CSV" />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {!file ? (
          <Card>
            <CardHeader title="Upload File" subtitle="Drag and drop a CSV file or click to browse" />
            <UploadZone onFile={handleFile} accept=".csv" />
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
                  Import successful!
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
