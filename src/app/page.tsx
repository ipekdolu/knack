import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { ButtonLink } from "@/components/ui/button";
import { MascotPlaceholder } from "@/components/ui/mascot-placeholder";

const FEATURES = [
  {
    emoji: "🧠",
    title: "Flashcards that know what you forgot",
    body: "Words come back on a schedule based on how well you actually knew them, not a fixed loop.",
  },
  {
    emoji: "✍️",
    title: "Practice using words, not just recognizing them",
    body: "Fill in the blank, write a sentence, hold a spoken conversation, or read a short passage -- each one graded with specific feedback.",
  },
  {
    emoji: "📚",
    title: "Built on the Goethe-Institut A1-C1 word lists",
    body: "Thousands of words, sorted by level, plus anything you add yourself.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Pick your level",
    body: "A1 through C1 -- change it any time in Settings as you improve.",
  },
  {
    step: "2",
    title: "Practice a little every day",
    body: "Flashcards, sentences, reading, and speaking -- a few minutes keeps your streak alive.",
  },
  {
    step: "3",
    title: "Get feedback, not just a score",
    body: "Claude grades your writing and speaking with specific, in-context corrections.",
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
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between p-4">
        <span className="font-logo text-xl font-extrabold">Knack</span>
        <ButtonLink href="/login" variant="secondary">
          Sign in
        </ButtonLink>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-16 p-6 pb-20 pt-6 sm:pt-10">
        <section className="flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 scale-125 rounded-full bg-accent/25 blur-2xl"
            />
            <MascotPlaceholder alt="Knack potato mascot" size={112} />
          </div>
          <Pill tone="surface">A1 &rarr; C1 &middot; free to use</Pill>
          <h1 className="max-w-2xl font-heading text-4xl font-extrabold sm:text-5xl">
            Learn German by actually using it
          </h1>
          <p className="max-w-xl text-lg font-medium text-primary-ink/80">
            Reading, writing, and speaking real sentences -- with feedback on
            each one, not just a green checkmark.
          </p>
          <ButtonLink href="/login">Sign in with Google &rarr;</ButtonLink>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="flex flex-col gap-2">
              <span className="text-2xl" aria-hidden>
                {feature.emoji}
              </span>
              <p className="font-heading font-extrabold">{feature.title}</p>
              <p className="text-sm text-text-muted">{feature.body}</p>
            </Card>
          ))}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-center font-heading text-2xl font-extrabold">
            How it works
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.step} className="flex flex-col gap-1">
                <span className="font-heading text-2xl font-extrabold text-accent-ink">
                  {s.step}
                </span>
                <p className="font-heading font-extrabold">{s.title}</p>
                <p className="text-sm text-text-muted">{s.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-card border-[2.5px] border-text bg-surface p-8 text-center shadow-hard">
          <MascotPlaceholder alt="Knack potato mascot" size={64} />
          <p className="font-heading text-xl font-extrabold">
            Free to use. No credit card, ever.
          </p>
          <ButtonLink href="/login">Sign in with Google &rarr;</ButtonLink>
        </section>
      </main>
    </div>
  );
}
