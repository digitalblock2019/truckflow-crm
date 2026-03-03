const STEPS = [
  { key: "pending", label: "Pending" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
];

export default function LoadPipeline({ status }: { status: string }) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-0 mb-5">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <div
            key={step.key}
            className={`flex-1 px-3.5 py-2.5 text-center text-[11px] font-mono border border-r-0 last:border-r
              first:rounded-l-md last:rounded-r-md
              ${done ? "bg-green-bg text-green border-green/40" : ""}
              ${current ? "bg-blue text-white border-blue" : ""}
              ${!done && !current ? "bg-surface-mid text-txt-mid border-border" : ""}
            `}
          >
            <div className="text-[9px] uppercase tracking-wide">{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}
