"use client";

import { useState } from "react";

export default function SensitiveField({
  maskedValue,
  onReveal,
}: {
  maskedValue: string;
  onReveal?: () => Promise<string>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (!onReveal) return;
    setLoading(true);
    try {
      const v = await onReveal();
      setValue(v);
      setRevealed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-[5px] bg-white text-[13px] text-txt">
      <span className={`font-mono ${revealed ? "" : "tracking-[3px] text-txt-light"}`}>
        {revealed ? value : maskedValue}
      </span>
      <button
        onClick={handleReveal}
        disabled={loading}
        className="ml-auto text-[10px] font-mono text-blue cursor-pointer underline whitespace-nowrap"
      >
        {loading ? "..." : revealed ? "Hide" : "Reveal"}
      </button>
    </div>
  );
}
