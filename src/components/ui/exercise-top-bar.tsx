import Link from "next/link";
import { Pill } from "./pill";

// The compact top row every exercise screen shares: back arrow, exercise
// type label (black/yellow pill), level badge, and a right-aligned status
// (progress count, timer, ...). Kept tight so the question card below still
// fits in one viewport.
export function ExerciseTopBar({
  backHref,
  typeLabel,
  level,
  status,
}: {
  backHref: string;
  typeLabel: string;
  level?: string | null;
  status?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Link
          href={backHref}
          aria-label="Back"
          className="text-lg font-bold text-primary-ink/70 hover:text-primary-ink"
        >
          &larr;
        </Link>
        <Pill tone="status">{typeLabel}</Pill>
        {level && <Pill tone="surface">{level}</Pill>}
      </div>
      {status && (
        <span className="text-sm font-bold text-primary-ink">{status}</span>
      )}
    </div>
  );
}
