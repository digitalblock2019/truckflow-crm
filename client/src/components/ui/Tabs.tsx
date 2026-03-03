"use client";

export interface Tab {
  key: string;
  label: string;
  count?: number;
}

export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-0 border-b-2 border-border bg-white px-6 shrink-0">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-[18px] py-2.5 text-[13px] font-medium cursor-pointer border-b-2 -mb-[2px] transition-all duration-100 whitespace-nowrap
            ${active === t.key
              ? "text-blue border-blue"
              : "text-txt-mid border-transparent hover:text-blue"
            }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-[10px] text-[10px] font-mono ml-1.5
                ${active === t.key ? "bg-[#dbeafe] text-blue" : "bg-surface-mid text-txt-mid"}`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
