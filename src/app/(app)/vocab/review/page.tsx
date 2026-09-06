import ExerciseSession from "@/components/exercise-session";

export default function VocabReviewPage() {
  return (
    <ExerciseSession
      type="flashcard"
      title="Review"
      backHref="/vocab"
      showAddWord
      showFlagButton
    />
  );
}
