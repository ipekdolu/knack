import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { generationLog } from "@/db/schema";

// Soft per-day caps on every Claude call site that isn't already bounded by
// a stronger mechanism. (Flashcard/fill-blank generation is deliberately
// NOT listed here -- it's cached in `word_content`, keyed by word only
// (shared across every user), so the real ceiling on those calls is
// (distinct words x MAX_VARIANTS), not per-user request volume. Adding a
// per-user cap on top of that would be redundant.)
// Generous enough for genuine daily practice, low enough that one account
// can't run up an unbounded API bill by looping requests.
const DAILY_LIMITS = {
  // Fresh content every call, no caching -- the costliest, most abusable.
  reading: 20,
  scenario: 20,
  conversation_start: 15,
  // Grading/hints: still uncached (each grades a unique submission), but
  // gated behind genuine user effort each time -- generous ceilings mainly
  // as a backstop against a scripted loop.
  sentence_grade: 100,
  sentence_hint: 100,
  scenario_grade: 30,
  conversation_turn: 150,
  conversation_hint: 100,
  conversation_grade: 30,
} as const;

export type RateLimitedAction = keyof typeof DAILY_LIMITS;

// Throws if the user has already hit today's cap for this action; otherwise
// records this call and lets it through. Recorded at generation time (not
// completion/submission time) so a user can't dodge the cap by generating
// repeatedly without ever finishing the exercise.
export async function enforceDailyLimit(
  userId: string,
  action: RateLimitedAction,
): Promise<void> {
  const limit = DAILY_LIMITS[action];
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generationLog)
    .where(
      and(
        eq(generationLog.userId, userId),
        eq(generationLog.action, action),
        gte(generationLog.createdAt, startOfDay),
      ),
    );

  if (count >= limit) {
    throw new Error(
      `You've hit today's limit for this exercise (${limit}/day) -- it resets at midnight UTC. Try a different activity in the meantime.`,
    );
  }

  await db.insert(generationLog).values({ userId, action });
}
