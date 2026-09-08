import { getDashboardStats } from "@/lib/practice/actions";
import { getDisplayName } from "../settings/actions";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Pill } from "@/components/ui/pill";
import { ButtonLink } from "@/components/ui/button";
import { MascotPlaceholder } from "@/components/ui/mascot-placeholder";
import { LinkCard } from "@/components/ui/link-card";

export default async function HomePage() {
  const [stats, displayName] = await Promise.all([
    getDashboardStats(),
    getDisplayName(),
  ]);
  const { new: newCount, learning, mastered } = stats.mastery;
  const masteryTotal = newCount + learning + mastered || 1;
  const greeting = displayName ? `Hallo, ${displayName}!` : "Your progress";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-3">
        <MascotPlaceholder
          alt="Knack potato mascot, waving hello"
          size={72}
        />
        <div>
          <h1 className="font-heading text-2xl font-extrabold">
            {greeting}
          </h1>
          {stats.level && <Pill tone="surface">Level {stats.level}</Pill>}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <StatCard
          compact
          value={stats.accuracyPct !== null ? `${stats.accuracyPct}%` : "—"}
          label="Accuracy"
        />
        <StatCard compact value={stats.wordsPracticed} label="Words" />
        <StatCard compact value={stats.streak} label="Streak" />
      </div>

      <Card padding="p-4">
        <div className="flex items-center justify-between text-sm font-bold">
          <span>Mastery</span>
          <span className="text-xs font-medium text-text-muted">
            New {newCount} &middot; Learning {learning} &middot; Mastered{" "}
            {mastered}
          </span>
        </div>
        <div className="mt-2 flex h-3 overflow-hidden rounded-pill bg-peach/50">
          <div
            className="bg-accent"
            style={{ width: `${(learning / masteryTotal) * 100}%` }}
          />
          <div
            className="bg-success"
            style={{ width: `${(mastered / masteryTotal) * 100}%` }}
          />
        </div>
      </Card>

      <ButtonLink href="/activities" className="w-full">
        Start today&apos;s practice &rarr;
      </ButtonLink>

      <div className="flex flex-col gap-3">
        <LinkCard
          href="/vocab"
          title="Vocabulary"
          description="Learn new words, review, or drill difficult ones."
        />
        <LinkCard
          href="/activities"
          title="Activities"
          description="Sentences, reading, speaking, and more."
        />
      </div>
    </div>
  );
}
