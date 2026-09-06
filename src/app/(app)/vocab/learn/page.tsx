import ExerciseSession from "@/components/exercise-session";
import { getNewWords } from "@/lib/practice/actions";

export default function StartLearningPage() {
  return (
    <ExerciseSession
      type="flashcard"
      title="Start learning"
      backHref="/vocab"
      showFlagButton
      loadWords={getNewWords}
      emptyMessage="No new words left at your level -- nice work. Try a different level in Settings, or head to Review."
    />
  );
}
