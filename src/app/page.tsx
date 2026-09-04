import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats } from "./practice/actions";
import LogoutButton from "./logout-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const stats = await getDashboardStats();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{user.email}</p>
          <LogoutButton />
        </div>

        <h1 className="mt-4 text-xl font-semibold">Your progress</h1>

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
          <div className="rounded-lg border border-dashed border-gray-300 p-4 opacity-60">
            <p className="text-2xl font-semibold">&mdash;</p>
            <p className="text-sm text-gray-500">Day streak (coming soon)</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-4 opacity-60">
          <p className="font-medium">Mastery breakdown</p>
          <p className="text-sm text-gray-500">
            New / learning / mastered word counts are coming soon.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/practice"
            className="rounded-md bg-black px-4 py-2 text-center text-white hover:bg-gray-800"
          >
            Practice
          </Link>
        </div>
      </div>
    </div>
  );
}
