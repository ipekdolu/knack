import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvailableLevels } from "@/lib/practice/actions";
import {
  getPreferredLevel,
  getCardsPerSession,
  getDisplayName,
  getSpeakingTurns,
} from "./actions";
import { Card } from "@/components/ui/card";
import LevelPicker from "./level-picker";
import CardsPerSessionPicker from "./cards-per-session-picker";
import SpeakingTurnsPicker from "./speaking-turns-picker";
import DisplayNamePicker from "./display-name-picker";
import ResetProgressButton from "./reset-progress-button";
import LogoutButton from "../../logout-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [levels, preferredLevel, cardsPerSession, displayName, speakingTurns] =
    await Promise.all([
      getAvailableLevels(),
      getPreferredLevel(),
      getCardsPerSession(),
      getDisplayName(),
      getSpeakingTurns(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-sm">
        <Link
          href="/home"
          className="text-sm font-bold text-primary-ink/70 hover:text-primary-ink"
        >
          &larr; Back
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-extrabold">Settings</h1>

        <Card padding="p-4" className="mt-4 flex flex-col gap-4">
          <h2 className="font-heading font-bold">Account</h2>
          <div>
            <p className="text-sm font-bold text-text-muted">Name</p>
            <p className="mb-1 text-xs text-text-muted">
              Shown on your home page greeting.
            </p>
            <DisplayNamePicker initialName={displayName} />
          </div>
          <div>
            <p className="text-sm font-bold text-text-muted">Email</p>
            <p className="text-sm font-medium">{user.email}</p>
          </div>
          <LogoutButton />
        </Card>

        <Card padding="p-4" className="mt-4 flex flex-col gap-4">
          <div>
            <h2 className="font-heading font-bold">Study preferences</h2>
            <p className="mt-1 text-sm text-text-muted">
              Practice sessions use this level until you change it.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-text-muted">Level</p>
            <LevelPicker levels={levels} initialLevel={preferredLevel} />
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-text-muted">
              Cards per session
            </p>
            <CardsPerSessionPicker initialCount={cardsPerSession} />
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-text-muted">
              Speaking exchanges
            </p>
            <p className="mb-2 text-xs text-text-muted">
              How many back-and-forth turns a conversation session runs for.
            </p>
            <SpeakingTurnsPicker initialCount={speakingTurns} />
          </div>
        </Card>

        <Card padding="p-4" className="mt-4 flex flex-col gap-3">
          <h2 className="font-heading font-bold">Data</h2>
          <p className="text-sm text-text-muted">
            Start over on mastery progress without losing your word list.
          </p>
          <ResetProgressButton />
        </Card>
      </div>
    </div>
  );
}
