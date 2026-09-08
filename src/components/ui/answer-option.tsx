import type { ButtonHTMLAttributes } from "react";

export type AnswerState = "default" | "selected" | "correct" | "incorrect";

const stateClasses: Record<AnswerState, string> = {
  default: "border-text bg-surface hover:bg-background/40",
  selected: "border-accent bg-accent/10",
  correct: "border-success bg-success/10",
  incorrect: "border-error bg-error/10",
};

type AnswerOptionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: AnswerState;
};

// A single multiple-choice answer cell: same card language (bold border,
// small hard shadow) as everything else, with tinted border/fill states
// for "picked" vs. revealed correct/incorrect.
export function AnswerOption({
  state = "default",
  className = "",
  ...props
}: AnswerOptionProps) {
  return (
    <button
      type="button"
      className={`rounded-btn border-[2.5px] px-4 py-3 text-center font-bold shadow-hard-sm transition active:scale-[0.98] disabled:active:scale-100 ${stateClasses[state]} ${className}`}
      {...props}
    />
  );
}
