"use client";

import { useState } from "react";
import { setDisplayName } from "./actions";

export default function DisplayNamePicker({
  initialName,
}: {
  initialName: string | null;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleBlur() {
    if (name.trim() === (initialName ?? "").trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await setDisplayName(name);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        onBlur={handleBlur}
        placeholder="Your name"
        maxLength={40}
        className="rounded-btn border-[2.5px] border-text bg-surface px-4 py-2.5 font-medium shadow-hard-sm focus:outline-none"
      />
      {saving && <p className="text-sm font-medium text-primary-ink/70">Saving...</p>}
      {saved && !saving && <p className="text-sm font-bold text-success">Saved.</p>}
    </div>
  );
}
