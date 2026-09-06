import Link from "next/link";

export default function VocabPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Vocab</h1>
        <p className="mt-1 text-sm text-gray-500">
          Meet new words and review the ones you&apos;ve seen.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/vocab/review"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Review</p>
          <p className="text-sm text-gray-500">
            Flashcards for words due today, mixed with new ones.
          </p>
        </Link>

        <Link
          href="/vocab/difficult"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Difficult words</p>
          <p className="text-sm text-gray-500">
            Words you&apos;ve starred, or that you consistently miss.
          </p>
        </Link>

        <Link
          href="/vocab/speed"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Speed review</p>
          <p className="text-sm text-gray-500">
            A timed drill through as many cards as you can. Doesn&apos;t
            affect your progress tracking.
          </p>
        </Link>

        <Link
          href="/vocab/add"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Create your own flashcard</p>
          <p className="text-sm text-gray-500">
            Write a German word and Claude fills in its level, part of
            speech, and gender.
          </p>
        </Link>
      </div>
    </div>
  );
}
