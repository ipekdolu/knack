import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Tailwind padding utility, e.g. "p-3". Defaults to "p-5". */
  padding?: string;
  /** Tailwind shadow utility. Defaults to the big hard-offset shadow;
   *  pass "shadow-hard-sm" for small/compact cards. */
  shadow?: string;
};

// The signature card: white background, bold black outline, hard-offset
// "sticker" shadow (no blur) instead of a soft drop shadow.
export function Card({
  className = "",
  padding = "p-5",
  shadow = "shadow-hard",
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-card border-[2.5px] border-text bg-surface ${padding} ${shadow} ${className}`}
      {...props}
    />
  );
}
