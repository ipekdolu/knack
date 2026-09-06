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
          href="/vocab/add"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Add a word</p>
          <p className="text-sm text-gray-500">
            Type a German word and Claude fills in its level, part of speech
            and gender.
          </p>
        </Link>

        <div className="rounded-lg border border-dashed border-gray-300 p-4 opacity-60">
          <p className="font-medium">Difficult words</p>
          <p className="text-sm text-gray-500">Coming soon.</p>
        </div>

        <div className="rounded-lg border border-dashed border-gray-300 p-4 opacity-60">
          <p className="font-medium">Speed review</p>
          <p className="text-sm text-gray-500">Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
