import Link from "next/link";

export default function ActivitiesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Activities</h1>
        <p className="mt-1 text-sm text-gray-500">
          Put the words to work. Choose an activity.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/activities/fill-blank"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Fill in the blank</p>
          <p className="text-sm text-gray-500">
            Pick the right word to complete a sentence.
          </p>
        </Link>

        <Link
          href="/activities/write"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Sentence practice</p>
          <p className="text-sm text-gray-500">
            Write a sentence using a few target words, graded by Claude.
          </p>
        </Link>

        <Link
          href="/activities/speak/read"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Read aloud</p>
          <p className="text-sm text-gray-500">
            Say a sentence out loud and see how much was heard correctly.
          </p>
        </Link>

        <Link
          href="/activities/speak/prompt"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Speaking prompt</p>
          <p className="text-sm text-gray-500">
            Answer a question out loud using a few target words.
          </p>
        </Link>

        <Link
          href="/activities/scenario"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Scenario writing</p>
          <p className="text-sm text-gray-500">
            Respond to a real-world scenario in German. Graded on tone and
            structure, not just vocabulary.
          </p>
        </Link>

        <Link
          href="/activities/read"
          className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
        >
          <p className="font-medium">Reading</p>
          <p className="text-sm text-gray-500">
            Read a short passage, then answer comprehension questions and
            spot the target words.
          </p>
        </Link>
      </div>
    </div>
  );
}
