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
            className={`rounded-btn border-[2.5px] border-text px-4 py-2 font-bold shadow-hard-sm transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
              selected === l
                ? "bg-text text-primary"
                : "bg-surface hover:bg-background/40"
            }`}
          >
            {l}
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
