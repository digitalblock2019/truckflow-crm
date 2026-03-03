"use client";

import { useCallback, useState, DragEvent } from "react";

export default function UploadZone({
  onFile,
  accept = ".csv,.xlsx,.xls",
}: {
  onFile: (file: File) => void;
  accept?: string;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.onchange = () => {
          if (input.files?.[0]) onFile(input.files[0]);
        };
        input.click();
      }}
      className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-150
        ${dragging ? "border-blue-light bg-[#f0f6ff]" : "border-border bg-[#fafbfc] hover:border-blue-light hover:bg-[#f0f6ff]"}`}
    >
      <div className="text-4xl mb-3">&#x1F4C4;</div>
      <div className="text-[15px] font-semibold text-navy">
        Drop file here or click to browse
      </div>
      <div className="text-xs text-txt-light mt-1.5">
        Supports CSV, XLSX up to 10 MB
      </div>
    </div>
  );
}
