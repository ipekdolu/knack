import type { ReactNode } from "react";
import { Card } from "./card";

export function StatCard({
  value,
  label,
  compact = false,
  className = "",
}: {
  value: ReactNode;
  label: string;
  /** Denser sizing for space-constrained layouts (e.g. Home's stat row). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <Card
      padding={compact ? "p-3" : "p-5"}
      shadow={compact ? "shadow-hard-sm" : "shadow-hard"}
      className={`flex flex-col ${compact ? "gap-0" : "gap-1"} ${className}`}
    >
      <p
        className={`font-heading font-extrabold text-text ${compact ? "text-xl" : "text-3xl"}`}
      >
        {value}
      </p>
      <p className={`text-text-muted ${compact ? "text-xs" : "text-sm"}`}>
        {label}
      </p>
    </Card>
  );
}
