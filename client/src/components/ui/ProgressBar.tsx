export default function ProgressBar({
  value,
  max = 100,
  className = "",
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`bg-surface-mid rounded-[10px] h-2 overflow-hidden mt-1 ${className}`}>
      <div
        className="h-full bg-green rounded-[10px] transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
