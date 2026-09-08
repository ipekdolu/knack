import type { HTMLAttributes } from "react";

export type PillTone =
  | "neutral"
  | "primary"
  | "accent"
  | "peach"
  | "success"
  | "error"
  | "surface"
  | "status";

const tones: Record<PillTone, string> = {
  // Deliberately independent of --background: that token is a saturated
  // color, so a muted pill needs its own flat tint to still read as
  // "neutral" rather than as another bold color.
  neutral: "bg-text/10 text-text-muted",
  primary: "bg-white text-primary-ink",
  accent: "bg-accent/15 text-accent-ink",
  peach: "bg-peach text-peach-ink",
  success: "bg-success/15 text-success",
  error: "bg-error/15 text-error",
  // Outlined white pill — level/register badges (e.g. "B1", "B1 · Sie").
  surface: "border-2 border-text bg-surface text-text",
  // Active nav item + exercise-type label — solid black, yellow text.
  status: "bg-text text-primary",
};

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: PillTone;
};

// Rounded pill tag for CEFR levels, difficulty, and status labels.
export function Pill({ tone = "neutral", className = "", ...props }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-3 py-1 text-xs font-bold ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
