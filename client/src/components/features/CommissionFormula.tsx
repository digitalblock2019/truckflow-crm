export default function CommissionFormula({
  grossLoad,
  carrierPay,
  netRevenue,
  rate,
  commission,
}: {
  grossLoad: string;
  carrierPay: string;
  netRevenue: string;
  rate: string;
  commission: string;
}) {
  const items = [
    { label: "Gross Load", value: grossLoad },
    { label: "Carrier Pay", value: carrierPay },
    { label: "Net Revenue", value: netRevenue },
    { label: "Comm Rate", value: rate },
    { label: "Commission", value: commission },
  ];

  return (
    <div className="bg-navy text-white rounded-lg px-5 py-4 mb-4 flex gap-6 items-center font-mono text-xs">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-[10px] text-white/45 uppercase tracking-wide">
              {item.label}
            </div>
            <div className="text-lg font-bold text-accent mt-0.5">{item.value}</div>
          </div>
          {i < items.length - 1 && (
            <span className="text-white/20 text-xl">
              {i === 1 ? "=" : i === 3 ? "=" : "−"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
