"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { repairStreak } from "@/lib/missions/actions";

export default function StreakRepairButton({
  available,
  cost,
  balance,
}: {
  available: boolean;
  cost: number;
  balance: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!available) {
    return (
      <p className="text-sm text-gray-400">
        Not available right now -- this only kicks in if your streak shows a
        single missed day.
      </p>
    );
  }

  async function handleRepair() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await repairStreak();
      setMessage(result.message);
      if (result.success) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleRepair}
        disabled={loading || balance < cost}
        className="w-fit rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Repairing..." : `Repair streak (${cost} points)`}
      </button>
      {balance < cost && (
        <p className="text-xs text-amber-600">
          You need {cost - balance} more points.
        </p>
      )}
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
