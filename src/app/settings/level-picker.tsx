"use client";

import { useState } from "react";
import { setPreferredLevel } from "./actions";

export default function LevelPicker({
  levels,
  initialLevel,
}: {
  levels: string[];
  initialLevel: string | null;
}) {
  const [selected, setSelected] = useState(initialLevel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function choose(level: string) {
    if (level === selected) return;
    setSelected(level);
    setSaving(true);
    setSaved(false);
    try {
      await setPreferredLevel(level);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {levels.map((l) => (
          <button
            key={l}
            onClick={() => choose(l)}
            disabled={saving}
            className={`rounded-md border px-4 py-2 disabled:opacity-50 ${
              selected === l
                ? "border-black bg-black text-white"
                : "border-gray-300 hover:bg-gray-100"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {saving && <p className="text-sm text-gray-500">Saving...</p>}
      {saved && !saving && <p className="text-sm text-green-600">Saved.</p>}
    </div>
  );
}
