import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvailableLevels } from "@/lib/practice/actions";
import { getPreferredLevel, getCardsPerSession } from "./actions";
import LevelPicker from "./level-picker";
import CardsPerSessionPicker from "./cards-per-session-picker";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [levels, preferredLevel, cardsPerSession] = await Promise.all([
    getAvailableLevels(),
    getPreferredLevel(),
    getCardsPerSession(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-sm">
        <Link href="/home" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Practice sessions use this level until you change it.
        </p>

        <div className="mt-4">
          <LevelPicker levels={levels} initialLevel={preferredLevel} />
        </div>

        <h2 className="mt-6 text-sm font-medium text-gray-700">
          Cards per session
        </h2>
        <div className="mt-2">
          <CardsPerSessionPicker initialCount={cardsPerSession} />
        </div>
      </div>
    </div>
  );
}
