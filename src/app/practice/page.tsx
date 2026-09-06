import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PracticeHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Practice</h1>
        <p className="mt-1 text-sm text-gray-500">Choose an activity.</p>

        <div className="mt-4 flex flex-col gap-3">
          <Link
            href="/practice/flashcards"
            className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
          >
            <p className="font-medium">Flashcards</p>
            <p className="text-sm text-gray-500">
              See a word, recall its meaning, then check yourself.
            </p>
          </Link>

          <Link
            href="/practice/fill-blank"
            className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
          >
            <p className="font-medium">Fill in the blank</p>
            <p className="text-sm text-gray-500">
              Pick the right word to complete a sentence.
            </p>
          </Link>

          <Link
            href="/practice/write"
            className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
          >
            <p className="font-medium">Sentence practice</p>
            <p className="text-sm text-gray-500">
              Write a sentence using a few target words, graded by Claude.
            </p>
          </Link>

          <Link
            href="/practice/speak/read"
            className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
          >
            <p className="font-medium">Read aloud</p>
            <p className="text-sm text-gray-500">
              Say a sentence out loud and see how much was heard correctly.
            </p>
          </Link>

          <Link
            href="/practice/speak/prompt"
            className="rounded-lg border border-gray-300 p-4 hover:bg-gray-100"
          >
            <p className="font-medium">Speaking prompt</p>
            <p className="text-sm text-gray-500">
              Answer a question out loud using a few target words.
            </p>
          </Link>

          <div className="rounded-lg border border-dashed border-gray-300 p-4 opacity-60">
            <p className="font-medium">Scenario practice</p>
            <p className="text-sm text-gray-500">Coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
