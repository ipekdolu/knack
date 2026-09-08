"use client";

import { useState } from "react";
import { setCardsPerSession } from "./actions";

const OPTIONS = [5, 10, 15, 20];

export default function CardsPerSessionPicker({
  initialCount,
}: {
  initialCount: number | null;
}) {
  const [selected, setSelected] = useState(initialCount ?? 10);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function choose(count: number) {
    if (count === selected) return;
    setSelected(count);
    setSaving(true);
    setSaved(false);
    try {
      await setCardsPerSession(count);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((count) => (
          <button
            key={count}
            onClick={() => choose(count)}
            disabled={saving}
            className={`rounded-btn border-[2.5px] border-text px-4 py-2 font-bold shadow-hard-sm transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
              selected === count
                ? "bg-text text-primary"
                : "bg-surface hover:bg-background/40"
            }`}
          >
            {count}
          </button>
        ))}
      </div>
      {saving && <p className="text-sm font-medium text-primary-ink/70">Saving...</p>}
      {saved && !saving && (
        <p className="text-sm font-bold text-success">Saved.</p>
      )}
    </div>
  );
}
