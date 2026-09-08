"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetProgress } from "./actions";

export default function ResetProgressButton() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setResetting(true);
    try {
      await resetProgress();
      router.push("/home");
      router.refresh();
    } finally {
      setResetting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-error">
          This deletes all mastery progress and exercise history. Your word
          list and preferences stay. This can&apos;t be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={resetting}
            className="rounded-btn border-2 border-error bg-error px-4 py-2 font-bold text-white shadow-hard-sm transition active:scale-95 disabled:opacity-50"
          >
            {resetting ? "Resetting..." : "Yes, reset everything"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={resetting}
            className="rounded-btn border-2 border-text bg-surface px-4 py-2 font-bold shadow-hard-sm transition active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="self-start rounded-btn border-2 border-error px-4 py-2 font-bold text-error shadow-hard-sm transition hover:bg-error/10 active:scale-95"
    >
      Reset progress
    </button>
  );
}
