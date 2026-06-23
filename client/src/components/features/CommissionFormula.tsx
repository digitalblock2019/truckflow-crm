import InfoTip from "@/components/ui/InfoTip";

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
  const items: { label: string; value: string; tooltip?: string }[] = [
    { label: "Gross Load", value: grossLoad, tooltip: "Total amount the broker pays for the load." },
    { label: "Carrier Pay", value: carrierPay, tooltip: "What the trucker (carrier) receives. Gross minus the company's cut." },
    { label: "Net Revenue", value: netRevenue, tooltip: "The company's slice of the gross — what's left after paying the carrier." },
    {
      label: "Empl Rate",
      value: rate,
      tooltip:
        "Combined sales-agent + dispatcher commission rate, as a percentage of Net Revenue. Each rep earns their own rate; this column is the total of both.",
    },
    {
      label: "Empl Comm",
      value: commission,
      tooltip: "Total commission paid out to sales agents and dispatchers across all loads in scope.",
    },
  ];

  return (
    <div className="bg-navy text-white rounded-lg px-5 py-4 mb-4 flex gap-6 items-center font-mono text-xs">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-[10px] text-white/45 uppercase tracking-wide inline-flex items-center justify-center">
              {item.label}
              {item.tooltip && <InfoTip text={item.tooltip} />}
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
