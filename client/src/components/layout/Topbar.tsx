"use client";

export default function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-white border-b border-border px-6 py-3 flex items-center gap-4 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-navy">{title}</h1>
        {subtitle && <p className="text-xs text-txt-light">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
