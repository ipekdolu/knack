import { LinkCard } from "@/components/ui/link-card";

export default function VocabPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-extrabold">Vocabulary</h1>
        <p className="mt-1 text-sm text-primary-ink/70">
          Meet new words and review the ones you&apos;ve seen.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <LinkCard
          href="/vocab/learn"
          title="Start learning"
          description="Fresh, never-seen words at your level."
        />
        <LinkCard
          href="/vocab/review"
          title="Review"
          description="Gradual, spaced-out practice: words due today, mixed with new ones."
        />
        <LinkCard
          href="/vocab/difficult"
          title="Difficult words"
          description="Words you've starred, or that you consistently miss."
        />
        <LinkCard
          href="/vocab/speed"
          title="Speed review"
          description="A timed drill through as many cards as you can. Doesn't affect your progress tracking."
        />
      </div>
    </div>
  );
}
