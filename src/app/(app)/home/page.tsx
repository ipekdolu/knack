import Link from "next/link";
import { getDashboardStats } from "@/lib/practice/actions";

export default async function HomePage() {
  const stats = await getDashboardStats();
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
        <h2 className="font-medium">Today&apos;s missions</h2>
        <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          Daily missions and points are coming soon. They&apos;ll show up here
          once built.
        </div>
      </section>
    </div>
  );
}
