export default function MissionsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Missions</h1>
        <p className="mt-1 text-sm text-gray-500">
          A small set of daily goals worth points.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
        <p>Not built yet.</p>
        <p className="mt-2">
          The plan: a fixed number of missions each day (so points can&apos;t be
          farmed), with points spendable on repairing a broken streak.
        </p>
      </div>
    </div>
  );
}
