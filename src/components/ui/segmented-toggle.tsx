// Shared two-or-more-option toggle (vocab source, answer mode, feedback
// timing, ...): white bordered pill track, active segment solid black.
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-pill border-2 border-text bg-surface p-1 text-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-pill px-3 py-1.5 font-bold transition disabled:opacity-50 ${
            value === opt.value
              ? "bg-text text-primary"
              : "text-text-muted hover:text-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
