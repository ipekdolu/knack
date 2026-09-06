import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  {
    title: "Flashcards that know what you forgot",
    body: "Words come back on a schedule based on how well you actually knew them, not a fixed loop.",
  },
  {
    title: "Practice using words, not just recognizing them",
    body: "Fill in the blank, write a sentence, or answer a question out loud -- each one graded with specific feedback.",
  },
  {
    title: "Built on the Goethe-Institut A1-B1 word lists",
    body: "Around 3,000 words, sorted by level, plus anything you add yourself.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in visitors have no use for the pitch -- send them to the app.
  if (user) {
    redirect("/home");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-10 p-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">German Vocab Practice</h1>
        <p className="text-lg text-gray-600">
          Learn German vocabulary by using it -- reading, writing and speaking
          real sentences, with feedback on each one.
        </p>
        <div>
          <Link
            href="/login"
            className="inline-block rounded-md bg-black px-5 py-2.5 text-white hover:bg-gray-800"
          >
            Sign in with Google
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-lg border border-gray-300 p-4">
            <p className="font-medium">{feature.title}</p>
            <p className="mt-1 text-sm text-gray-500">{feature.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
