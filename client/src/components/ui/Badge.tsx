type Color = "green" | "red" | "orange" | "blue" | "purple" | "gray";

const colorClasses: Record<Color, string> = {
  green: "bg-green-bg text-green",
  red: "bg-red-bg text-red",
  orange: "bg-orange-bg text-orange",
  blue: "bg-[#dbeafe] text-blue",
  purple: "bg-purple-bg text-purple",
  gray: "bg-surface-mid text-txt-mid",
};

export default function Badge({
  color = "gray",
  children,
  className = "",
}: {
  color?: Color;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[10px] text-[10px] font-semibold font-mono whitespace-nowrap ${colorClasses[color]} ${className}`}
    >
      {children}
    </span>
  );
}
