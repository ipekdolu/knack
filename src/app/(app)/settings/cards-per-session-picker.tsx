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
            className={`rounded-md border px-4 py-2 disabled:opacity-50 ${
              selected === count
                ? "border-black bg-black text-white"
                : "border-gray-300 hover:bg-gray-100"
            }`}
          >
            {count}
          </button>
        ))}
      </div>
      {saving && <p className="text-sm text-gray-500">Saving...</p>}
      {saved && !saving && <p className="text-sm text-green-600">Saved.</p>}
    </div>
  );
}
