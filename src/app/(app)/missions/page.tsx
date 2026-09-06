import { getTodayMissions } from "@/lib/missions/actions";
import StreakRepairButton from "./streak-repair-button";

export default async function MissionsPage() {
  const { missions, pointsBalance, streakRepairAvailable, streakRepairCost } =
    await getTodayMissions();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Missions</h1>
        <p className="mt-1 text-sm text-gray-500">
          A small set of daily goals worth points.
        </p>
      </div>

      <div className="rounded-lg border border-gray-300 p-4">
        <p className="text-2xl font-semibold">{pointsBalance}</p>
        <p className="text-sm text-gray-500">Points</p>
      </div>

      <div className="flex flex-col gap-3">
        {missions.map((m) => {
          const pct = Math.min(100, (m.progressCount / m.targetCount) * 100);
          return (
            <div key={m.id} className="rounded-lg border border-gray-300 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{m.label}</p>
                <span
                  className={`text-sm font-medium ${m.completed ? "text-green-600" : "text-gray-500"}`}
                >
                  {m.completed ? "Done" : `${m.progressCount}/${m.targetCount}`}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${m.completed ? "bg-green-500" : "bg-black"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">{m.points} points</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-gray-300 p-4">
        <p className="font-medium">Streak repair</p>
        <p className="mt-1 text-sm text-gray-500">
          Missed exactly one day? Spend {streakRepairCost} points to restore
          your streak. Only works for a single-day gap -- a genuine catch-up,
          not a free pass.
        </p>
        <div className="mt-3">
          <StreakRepairButton
            available={streakRepairAvailable}
            cost={streakRepairCost}
            balance={pointsBalance}
          />
        </div>
      </div>
    </div>
  );
}
