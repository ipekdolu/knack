# German Vocab Practice App — Full To-Do List

**Scope:** A1–B1 vocabulary. B2–C1 sourcing is deferred (no standardized official wordlist above B1).

**Stack:** Next.js (App Router, TypeScript, npm) · Tailwind CSS · Supabase (Postgres + Auth) · Drizzle ORM · Claude API · Vercel deployment

**Priority key:** P0 = blocks everything else · P1 = core loop, needed for MVP · P2 = enhances MVP, can slip

**Status key:** ✅ Done · ⬜ Not started

---

## Key decisions

| Area | Decision |
|---|---|
| Auth | Google OAuth via Supabase Auth, from day 1. |
| Data ownership | `words` (seeded CEFR vocab) is global/shared across users. `user_word_progress` and manually-added `words` rows carry a `user_id`. |
| Manual word-add | Single text input (just the lemma). One Claude API call infers `{level, pos, gender}` as structured JSON; user confirms/edits before it's saved. |
| Mastery model | Simple 3-stage (new → learning → mastered) with day-based intervals — not full SM-2, at least initially. |
| Reminders | Deferred — small feature, add near the end. |
| Speaking | New *input method* into the Phase 5 grader, not a separate grading system (see Phase 6). |

---

## Phase 0 — Setup & Auth

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Create Supabase project | P0 | Project: `wordapp` |
| ✅ | Create Google OAuth client in Google Cloud Console | P0 | Redirect URI matched to Supabase's callback URL |
| ✅ | Enable Google provider in Supabase Auth (Client ID + Secret) | P0 | |
| ⬜ | Scaffold Next.js app (TS, App Router, Tailwind, npm) | P0 | Via Claude Code |
| ⬜ | Connect Drizzle ORM to Supabase Postgres | P0 | Session pooler connection string |
| ⬜ | Define schema: `words`, `user_word_progress`, `exercise_log` | P0 | See "Data model" below |
| ⬜ | Next.js/Supabase client-side Google login (login button, session, protected routes) | P0 | Backend auth config already done — this is just the app-side integration |
| ⬜ | Minimal homepage: "Logged in as [email]" + logout button | P1 | Confirms auth works end-to-end |
| ⬜ | Deploy skeleton to Vercel | P1 | Confirms deployment pipeline early — avoids RightsDE-style late memory/hosting surprises |

## Phase 1 — Word Bank (A1–B1)

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Source Goethe-Institut A1/A2/B1 wordlists | P0 | Manual download/transcription or scripted extraction, whichever is faster |
| ⬜ | Import script: seed `words` table with level + POS + gender (for nouns) | P0 | One-time script, run via direct DB connection (not the pooled app connection) |
| ⬜ | "Add word" flow: single-field input → Claude API infers `{level, pos, gender}` → confirm/edit screen → save | P0 | Replaces a plain manual-entry form |
| ⬜ | Word list view (browse/filter by level, category, source) | P2 | Useful for sanity-checking imported data, not essential to the exercise loop |

## Phase 2 — Core Exercise Loop

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Claude API call: generate flashcard (example sentence + gloss) for a word + level | P0 | This + fill-blank is the heart of the MVP |
| ⬜ | Flashcard UI + self-grading ("knew it" / "didn't") | P0 | |
| ⬜ | Claude API call: generate fill-in-blank sentence + distractors for a word + level | P0 | |
| ⬜ | Fill-in-blank UI + auto-grading | P0 | |
| ⬜ | Basic "exercise session" page serving a mix of both types | P1 | Doesn't need to be smart yet — just alternate types |

**Milestone: once Phase 2 is done, the app is usable for real daily practice** — worth starting to use it even before later phases exist.

## Phase 3 — Progress Tracking

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Update `user_word_progress` after each exercise (correct/incorrect, streak) | P0 | Needed before spaced repetition makes sense |
| ⬜ | 3-stage mastery model with day-based intervals | P1 | |
| ⬜ | "Words due today" query | P1 | Feeds Phase 4 |

## Phase 4 — Daily Session Orchestration

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Session picker: N due words + M new words per day | P1 | Tunable, e.g. 5 due + 2 new |
| ⬜ | "Today's practice" landing page | P1 | The page you'd actually open every morning |
| ⬜ | Streak/progress dashboard | P2 | Motivating, not functionally necessary |

## Phase 5 — Writing Exercises + Grading Engine ✅

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Claude API grading call: given target words + user's written response, return structured feedback (correct usage? grammar issues? level-appropriate?) | P0 | This grader is reused as-is by Phase 6 speaking exercises |
| ✅ | "Write a sentence using these words" exercise + UI | P0 | |
| ✅ | Store grading feedback in `exercise_log.feedback` | P1 | |

## Phase 6 — Speaking Practice ✅

Reuses the Phase 5 grader — speaking is a new input method, not a separate grading system.

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Mic capture + speech-to-text via browser Web Speech API (`de-DE`) | P0 | Free, no backend call. Works well in Chrome/Edge; patchy in Firefox/Safari — needs a fallback message |
| ✅ | "Read this sentence aloud" exercise: simple match-check against target text | P1 | No grading engine needed — just string comparison |
| ✅ | "Answer this prompt using these words" (spoken): transcript → Phase 5 grader | P1 | |
| ⬜ | (Stretch) Swap Web Speech API for OpenAI Whisper API transcription | P2 | ~$0.006/min — more reliable cross-browser, better on non-native accents |
| ⬜ | (Stretch) Pronunciation/accent scoring via Azure Speech Pronunciation Assessment | P2 | Separate account/SDK, real complexity — optional polish, not core |

---

# Restructure (Phases 8–11)

At end of Phase 6 the engine works but everything lives on one page. These phases reorganize the app into distinct spaces and add reading + missions. Design/branding stays deliberately minimal until Phase 12 — **working structure first, polish last.** Each phase is a small, independently testable stop.

**Decisions locked in for the restructure:**
- Flashcards (acquisition) and exercises (application) become separate spaces — flashcards are "step 1: meet the word," activities are "step 2: use the word."
- **No easy/medium/hard modes.** Dropped as confusing. CEFR level stays a filter (which word pool); mastery stage stays behind-the-scenes scheduling only.
- "Difficult words" pool = union of (accuracy < 50% over ≥3 attempts, computed from `exercise_log`) + (words the user manually flags via a star button).
- Missions: a *fixed* number of daily missions (e.g. 3) so the points faucet is capped and streak-repair can't be farmed. Simple version only — points awarded on completion, one spend (streak repair). More point sinks (cosmetics, XP levels) noted as future.

## Phase 8 — Navigation & Page Structure ✅

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Landing page (logged-out): what the app is + login CTA | P0 | Public at `/`; signed-in visitors redirect to `/home`. Also the future home for branding/mascot |
| ✅ | App navigation shell (Home / Vocab / Activities / Missions) | P0 | Bottom tabs on mobile, top bar on desktop. Lives in an `(app)` route-group layout that also enforces auth |
| ✅ | Home page: stats, streak, mastery breakdown, "start today's practice", surfaced daily missions | P0 | Missions section is a placeholder until Phase 11 builds them |
| ✅ | Move existing exercise UIs behind the new structure (no logic changes, just relocation) | P1 | Flashcards → `/vocab/review`; exercises → `/activities/*`. Shared logic moved to `src/lib/practice`. Old URLs redirect |

## Phase 9 — Vocab (Flashcards) Space

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Vocab landing: entry to flashcard modes | P0 | |
| ⬜ | Review (flashcards for words due / in rotation) | P0 | |
| ⬜ | Difficult Words pool (auto low-accuracy + manually flagged) | P1 | Add `is_flagged` boolean to `user_word_progress`; star button on cards |
| ⬜ | Speed Review (fast, timed flip-through) | P1 | |
| ⬜ | Custom flashcard creation | P1 | Ties into existing manual word-add |
| ⬜ | User control: how many cards per session | P2 | |

## Phase 10 — Activities Space + Reading

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Activities landing: pick exercise type (fill-blank, sentence, scenario, speaking) | P0 | Surfaces the exercises already built in earlier phases |
| ✅ | Scenario/passage writing (e.g. "write a complaint email") + richer grading (tone, structure, not just word usage) | P1 | Moved here from Phase 5 — never built; the Activities landing above expects it |
| ✅ | **Reading exercise (NEW)**: Claude generates a short level-appropriate passage seeded with target words → comprehension check / word identification | P1 | Reuses existing generation + grading engine; add `reading` to exercise_type enum |
| ✅ | Store reading results in `exercise_log` | P1 | |

## Phase 11 — Missions & Points (simple)

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | `daily_missions` + `user_points` schema | P0 | See data model additions |
| ⬜ | Generate a fixed set of daily missions per user (e.g. 3) | P0 | Cap makes points un-farmable |
| ⬜ | Track mission completion, award points | P0 | |
| ⬜ | Points balance display (Home / Missions page) | P1 | |
| ⬜ | Spend points to repair/extend streak (priced as genuine catch-up, not free pass) | P1 | The one point-sink for now |
| ⬜ | (Future) additional point sinks: cosmetics, XP levels | P2 | Noted, not built |

## Phase 12 — Production Readiness & Polish (was Phase 7)

Moved to the end: polishing before the structure settled would be wasted work. This is what separates "works on my machine" from something you'd demo confidently in an interview. **UI redesign / branding / potato mascot happens here too.**

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Enable Row Level Security (RLS) on all Supabase tables + write policies (users only read/write their own progress) | P0 | Security gap if skipped — anyone with the anon key could otherwise query other users' data |
| ⬜ | Error handling for Claude API failures (timeouts, rate limits, malformed JSON responses) | P0 | LLM calls fail sometimes — the app shouldn't crash, should retry or show a friendly message |
| ⬜ | UI redesign: design-system pass (color tokens, typography, reusable components) then restyle pages | P1 | Define tokens first, restyle second |
| ⬜ | Potato mascot: generate art (Recraft/DALL·E), add to hero / empty states / result screens | P1 | Leave placeholder image slots during restructure so this drops in cleanly |
| ⬜ | Loading states for all async actions (exercise generation, grading, session load) | P1 | Claude API calls take a few seconds — blank screens feel broken without this |
| ⬜ | Basic cost control on Claude API usage (e.g. cache generated exercises, avoid redundant calls) | P1 | Matters once this isn't just for personal use — worth doing anyway as good practice |
| ⬜ | Mobile-responsive layout check | P1 | You'll likely want to practice on your phone |
| ⬜ | README: setup instructions, architecture overview, decisions/tradeoffs made | P1 | This is what makes the project interview-defensible — the "why," not just the "what" |
| ⬜ | Environment variable separation: local dev vs. Vercel production | P2 | Avoid pointing prod at a dev DB or vice versa |
| ⬜ | Basic analytics/logging (which exercise types get used, error rates) | P2 | Optional, but useful for iterating post-launch |
| ⬜ | Automated tests for grading logic and mastery-stage transitions | P2 | Not essential for a personal tool, but strengthens the portfolio story if you have time |
| ⬜ | Naming decision (app name) + logo | P2 | Parked earlier; multilingual-friendly name preferred (not German/potato-locked) |

---

## Data model

```
words
  id
  lemma            -- dictionary form, e.g. "Kündigung"
  level            -- A1 / A2 / B1 / B2 / C1
  pos              -- part of speech
  gender           -- der/die/das, nouns only
  category         -- optional: bureaucracy, food, work...
  source           -- seed | manual
  user_id          -- null for seeded words, set for manually-added ones
  created_at

user_word_progress
  id
  user_id
  word_id
  mastery_stage    -- new / learning / mastered
  last_seen_at
  next_due_at
  correct_streak
  times_seen
  times_correct
  is_flagged       -- user-starred as difficult (Phase 9)

exercise_log
  id
  user_id
  word_ids         -- which words this exercise targeted
  exercise_type    -- flashcard | fill_blank | sentence | scenario | speaking_read | speaking_prompt | reading
  user_response
  score            -- or was_correct, for auto-graded types
  feedback         -- LLM-generated, for reviewed types
  created_at

-- Added in Phase 11 --

daily_missions
  id
  user_id
  date             -- which day this mission set belongs to
  mission_type     -- e.g. speaking_x2 / writing_x1 / review_x10
  target_count     -- how many to complete
  progress_count   -- how many done so far
  completed        -- bool
  points_awarded

user_points
  user_id
  balance          -- current spendable points
  updated_at
```

---

## Deferred / out of scope for now

- B2–C1 vocabulary sourcing strategy (LLM-generated difficulty tagging vs. corpus extraction from news/exam prep materials)
- Multi-user support beyond personal use (if this ever becomes shared/public — currently single-user auth is enough)
- Daily reminder mechanism (email/push)
