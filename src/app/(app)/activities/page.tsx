import { LinkCard } from "@/components/ui/link-card";

export default function ActivitiesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-extrabold">Activities</h1>
        <p className="mt-1 text-sm text-primary-ink/70">
          Put the words to work. Choose an activity.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <LinkCard
          href="/activities/fill-blank"
          title="Fill in the blank"
          description="Pick the right word to complete a sentence."
        />
        <LinkCard
          href="/activities/write"
          title="Sentence practice"
          description="Write a sentence using a few target words, graded with in-context feedback."
        />
        <LinkCard
          href="/activities/speak"
          title="Speaking"
          description="A free-flowing spoken conversation, exam-style -- no target words, just talk."
        />
        <LinkCard
          href="/activities/scenario"
          title="Scenario writing"
          description="Respond to a real-world scenario in German. Graded on tone and structure, not just vocabulary."
        />
        <LinkCard
          href="/activities/read"
          title="Reading"
          description="Read a short passage, then answer comprehension questions and spot the target words."
        />
      </div>
    </div>
  );
}
