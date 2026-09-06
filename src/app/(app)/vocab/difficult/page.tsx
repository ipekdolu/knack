import ExerciseSession from "@/components/exercise-session";
import { getDifficultWords } from "@/lib/practice/actions";

export default function DifficultWordsPage() {
  return (
    <ExerciseSession
      type="flashcard"
      title="Difficult words"
      backHref="/vocab"
      showFlagButton
      loadWords={getDifficultWords}
      emptyMessage="No difficult words yet -- star a card during Review, or keep practicing and this fills in automatically."
    />
  );
}
