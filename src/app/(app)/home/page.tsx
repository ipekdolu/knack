import Link from "next/link";
import { getDashboardStats } from "@/lib/practice/actions";
import { getTodayMissions } from "@/lib/missions/actions";

export default async function HomePage() {
  const [stats, missionsSummary] = await Promise.all([
    getDashboardStats(),
    getTodayMissions(),
  ]);
  const { new: newCount, learning, mastered } = stats.mastery;
  const masteryTotal = newCount + learning + mastered || 1;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-xl font-semibold">Your progress</h1>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-300 p-4">
            <p className="text-2xl font-semibold">{stats.totalExercises}</p>
            <p className="text-sm text-gray-500">Exercises done</p>
          </div>
          <div className="rounded-lg border border-gray-300 p-4">
            <p className="text-2xl font-semibold">
              {stats.accuracyPct !== null ? `${stats.accuracyPct}%` : "—"}
            </p>
            <p className="text-sm text-gray-500">Accuracy</p>
          </div>
          <div className="rounded-lg border border-gray-300 p-4">
            <p className="text-2xl font-semibold">{stats.wordsPracticed}</p>
            <p className="text-sm text-gray-500">Words practiced</p>
          </div>
          <div className="rounded-lg border border-gray-300 p-4">
            <p className="text-2xl font-semibold">{stats.streak}</p>
            <p className="text-sm text-gray-500">Day streak</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-gray-300 p-4">
          <p className="font-medium">Mastery breakdown</p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="bg-gray-400"
              style={{ width: `${(newCount / masteryTotal) * 100}%` }}
            />
            <div
              className="bg-amber-400"
              style={{ width: `${(learning / masteryTotal) * 100}%` }}
            />
            <div
              className="bg-green-500"
              style={{ width: `${(mastered / masteryTotal) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-sm text-gray-500">
            <span>New: {newCount}</span>
            <span>Learning: {learning}</span>
            <span>Mastered: {mastered}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {stats.level && (
          <p className="text-center text-sm text-gray-500">
            {stats.dueToday > 0
              ? `${stats.dueToday} word${stats.dueToday === 1 ? "" : "s"} due today`
              : "No words due today"}{" "}
            &middot; Level {stats.level}
          </p>
        )}
        <Link
          href="/activities"
          className="rounded-md bg-black px-4 py-2 text-center text-white hover:bg-gray-800"
        >
          Start today&apos;s practice
        </Link>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Today&apos;s missions</h2>
          <span className="text-sm font-medium text-gray-500">
            {missionsSummary.pointsBalance} points
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {missionsSummary.missions.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-gray-300 p-3 text-sm"
            >
              <span className={m.completed ? "text-green-700" : ""}>
                {m.completed ? "✓ " : ""}
                {m.label}
              </span>
              <span className="text-gray-500">
                {m.completed ? `+${m.points}` : `${m.progressCount}/${m.targetCount}`}
              </span>
            </div>
          ))}
        </div>
        <Link
          href="/missions"
          className="mt-2 inline-block text-sm text-gray-500 hover:underline"
        >
          View missions &rarr;
        </Link>
      </section>
    </div>
  );
}
