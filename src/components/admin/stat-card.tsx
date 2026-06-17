import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  accent?: "default" | "green" | "amber" | "red";
}

const accentClasses: Record<NonNullable<StatCardProps["accent"]>, string> = {
  default: "text-foreground",
  green: "text-[#4d7a52]",
  amber: "text-[#b3812c]",
  red: "text-destructive",
};

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "default",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${accentClasses[accent]}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
