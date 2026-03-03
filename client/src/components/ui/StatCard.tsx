export default function StatCard({
  label,
  value,
  delta,
  className = "",
}: {
  label: string;
  value: string | number;
  delta?: string;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-border rounded-lg p-4 ${className}`}>
      <div className="text-[11px] text-txt-light font-mono uppercase tracking-wide">
        {label}
      </div>
      <div className="text-[26px] font-bold text-navy mt-1.5 font-mono">{value}</div>
      {delta && <div className="text-[11px] text-green mt-1">{delta}</div>}
    </div>
  );
}
