import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvailableLevels } from "../actions";
import ExerciseSession from "../exercise-session";

export default async function FlashcardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const levels = await getAvailableLevels();

  return (
    <ExerciseSession
      type="flashcard"
      title="Flashcards"
      levels={levels}
      showAddWord
    />
  );
}
