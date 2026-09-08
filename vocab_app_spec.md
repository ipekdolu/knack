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
| ✅ | Scenario/passage writing (e.g. "write a complaint email") + richer grading (tone, structure, not just word usage) | P1 | |
| ✅ | Store grading feedback in `exercise_log.feedback` | P1 | |

## Phase 6 — Speaking Practice ✅ (word-anchored version — SUPERSEDED by Phase 12)

Original version reused the Phase 5 grader with word-anchored prompts. Found too limited (see Phase 12 for the redesign rationale). Read-aloud exercise is being removed entirely.

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Mic capture + speech-to-text via browser Web Speech API (`de-DE`) | P0 | Reused by the redesign |
| ~~✅~~ | ~~"Read this sentence aloud" exercise~~ | — | **REMOVED** — pronunciation drill, not real speaking practice |
| ~~✅~~ | ~~"Answer this prompt using these words" (spoken, word-anchored)~~ | — | **SUPERSEDED** by Phase 12 conversational format |
| ⬜ | (Stretch) Swap Web Speech API for OpenAI Whisper API transcription | P2 | ~$0.006/min — more reliable cross-browser, better on non-native accents |
| ⬜ | (Stretch) Pronunciation/accent scoring via Azure Speech Pronunciation Assessment | P2 | The only path to real pronunciation feedback — Web Speech API can't score accent |

---

# Restructure (Phases 8–11)

At end of Phase 6 the engine works but everything lives on one page. These phases reorganize the app into distinct spaces and add reading + missions. Design/branding stays deliberately minimal until Phase 12 — **working structure first, polish last.** Each phase is a small, independently testable stop.

**Decisions locked in for the restructure:**
- Flashcards (acquisition) and exercises (application) become separate spaces — flashcards are "step 1: meet the word," activities are "step 2: use the word."
- **No easy/medium/hard modes.** Dropped as confusing. CEFR level stays a filter (which word pool); mastery stage stays behind-the-scenes scheduling only.
- "Difficult words" pool = union of (accuracy < 50% over ≥3 attempts, computed from `exercise_log`) + (words the user manually flags via a star button).
- Missions: a *fixed* number of daily missions (e.g. 3) so the points faucet is capped and streak-repair can't be farmed. Simple version only — points awarded on completion, one spend (streak repair). More point sinks (cosmetics, XP levels) noted as future.

## Phase 8 — Navigation & Page Structure

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Landing page (logged-out): what the app is + login CTA | P0 | Also the future home for branding/mascot |
| ⬜ | App navigation shell (Home / Vocab / Activities / Missions) | P0 | Persistent nav so the new spaces are reachable |
| ⬜ | Home page: stats, streak, mastery breakdown, "start today's practice", surfaced daily missions | P0 | Reworks the current single page into the Home hub |
| ⬜ | Move existing exercise UIs behind the new structure (no logic changes, just relocation) | P1 | Pure reorganization — confirm nothing breaks before adding new features |

## Phase 9 — Vocab (Flashcards) Space

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Vocab landing: entry to flashcard modes | P0 | |
| ⬜ | Review (flashcards for words due / in rotation) | P0 | |
| ⬜ | Difficult Words pool (auto low-accuracy + manually flagged) | P1 | Add `is_flagged` boolean to `user_word_progress`; star button on cards |
| ⬜ | Speed Review (fast, timed flip-through) | P1 | |
| ⬜ | User control: how many cards per session | P2 | |

*(Decks / custom flashcard creation removed — decided against as unnecessary scope.)*

## Phase 10 — Activities Space + Reading ✅ (initial build — see Phase 13 revision)

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Activities landing: pick exercise type (fill-blank, sentence, scenario, speaking) | P0 | Surfaces the exercises already built in earlier phases |
| ✅ | Reading exercise: passage seeded with target words → comprehension check | P1 | Built, but leans on seen-words → too easy (fixed in Phase 13) |
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

---

# Revision phases (12–13) — exercise quality overhaul

Discovered after building: most exercises leaned on "words already seen in flashcards," which turns comprehension into recognition/pattern-matching and defeats the learning goal. Flashcards keeping word-anchoring is correct (that's acquisition); reading/writing/speaking should be **level-first, vocabulary-exposure-second.** These two phases fix that. Both are grounded in real Goethe/telc exam formats (researched, not guessed).

**Cross-cutting decision — vocabulary source toggle:** reading and fill-blank exercises get a user toggle: **"My words"** (reinforce seen/drilled vocabulary) vs. **"Level practice"** (level-appropriate pool including unseen words, so recognition can't shortcut the task). Both modes valuable; user chooses per session.

## Phase 12 — Speaking Module Redesign

Replaces the word-anchored Phase 6 speaking exercises with a conversational, exam-style module. Mirrors real Goethe oral exams, which from B1 up are a paired interaction (examiner/partner) — the role Claude plays.

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Remove old read-aloud + word-anchored speaking exercises | P0 | Clean removal before rebuild |
| ⬜ | Conversational session engine: Claude as examiner/partner, German-only, multi-turn | P0 | Fully free conversation — no target words. Claude simplifies its German at A1/A2 so immersive ≠ incomprehensible |
| ⬜ | Level-appropriate task types matched to real oral-exam formats | P0 | A1/A2: self-intro + everyday Q&A · B1: describe/narrate + opinion · B2: discuss/argue, Claude takes a counter-position · C1: present + problem-solve |
| ⬜ | Exam-like fixed turn count (~5–6 turns), then session ends | P1 | User's choice: exam-realism over open-ended |
| ⬜ | Feedback timing toggle (user chooses per session): gentle per-turn nudges OR clean end-of-session report | P1 | |
| ⬜ | End-of-session report scored on real oral-exam dimensions | P0 | Fluency, accuracy, spontaneity, interaction, vocabulary range, task completion — with examples from what the user said + corrected versions |
| ⬜ | Store speaking sessions in `exercise_log` (exercise_type `speaking_conversation`) | P1 | Replaces old `speaking_read` / `speaking_prompt` types |

## Phase 13 — Activities Fixes (revises Phase 10)

| Status | Task | Priority | Notes |
|---|---|---|---|
| ⬜ | Add vocabulary-source toggle (My words / Level practice) to reading + fill-blank | P0 | The core de-anchoring fix |
| ⬜ | Fill-blank: generate distractors that are same-level and plausibly fit the sentence | P0 | Forces understanding the sentence, not spotting the one known word |
| ⬜ | Fill-blank: optional free-type mode (no options) for a harder variant | P2 | Removes the multiple-choice shortcut entirely |
| ⬜ | Scenario/writing: prompts in German, modeled on real Schreiben tasks | P0 | Include explicit Leitpunkte (content points) + specify recipient so register (du/Sie) is testable |
| ⬜ | Scenario/writing: optional help words behind a "Wörter anzeigen, die helfen" button | P1 | Hidden by default so the answer isn't fed; revealed only if stuck |
| ⬜ | Scenario/writing: exam-style grading on the 4 official criteria | P0 | Kommunikative Zielerreichung/Erfüllung, Kohärenz, Wortschatz, Korrektheit — check each Leitpunkt covered + flag register errors. ~100-pt scale, 60 = pass |
| ⬜ | Reading: passage is level-appropriate with a few *new* stretch words woven in (comprehensible input) | P0 | Not built only from seen words |
| ⬜ | Reading: comprehension questions test meaning/inference, not word-spotting | P0 | Can't be answered by matching a familiar word |
| ⬜ | (Future idea) Reading → save new words from a passage into the vocab bank | P2 | Turns reading into a *source* of flashcard words; nice loop, deferred |

---

## Phase 14 — Production Readiness & Polish (FINAL STEP)

**The last phase — after Phases 12–13.** Polishing before the structure and exercise quality settled would be wasted work. This is what separates "works on my machine" from something you'd demo confidently in an interview. **UI redesign / branding / potato mascot happens here too.**

| Status | Task | Priority | Notes |
|---|---|---|---|
| ✅ | Enable Row Level Security (RLS) on all Supabase tables + write policies (users only read/write their own progress) | P0 | Migrations `0001`, `0003`, `0006`, `0009`, all scoped to `auth.uid()` |
| ✅ | Error handling for Claude API failures (timeouts, rate limits, malformed JSON responses) | P0 | Centralized client (`src/lib/claude/client.ts`): explicit timeout + retries, friendly user-facing messages, server-side error logging. Defensive `?? []` fallbacks for tool-use fields Claude occasionally omits despite `required`. Not done: per-user rate limiting on these actions |
| ✅ | UI redesign: design-system pass (color tokens, typography, reusable components) then restyle pages | P1 | Tokens/components in `src/components/ui/`, every page restyled to the locked design language below |
| ✅ | Potato mascot: generate art, add to hero / empty states / result screens | P1 | Built as an inline SVG (`src/components/ui/mascot-placeholder.tsx`) rather than a raster asset — stays crisp at any size, no extra image files. On Home, Login, landing, and every exercise "session complete" screen, plus the favicon |
| ✅ | Loading states for all async actions (exercise generation, grading, session load) | P1 | Every exercise session shows loading/generating text during async calls |
| ✅ | Basic cost control on Claude API usage (e.g. cache generated exercises, avoid redundant calls) | P1 | `src/lib/practice/content-cache.ts` — cache-first with occasional fresh-variant generation |
| ✅ | Mobile-responsive layout check | P1 | Responsive nav (bottom tab bar on mobile, inline on desktop) and layout throughout |
| ✅ | README: setup instructions, architecture overview, decisions/tradeoffs made | P1 | |
| ⬜ | Environment variable separation: local dev vs. production | P2 | Deferred until a deploy target is chosen (no deploy platform decided yet) |
| ✅ | Basic analytics/logging (which exercise types get used, error rates) | P2 | Lightweight version: Claude API errors logged server-side (`console.error` in the client wrapper) before being translated to a friendly message; per-user usage stats already surfaced on Home. No cross-user usage dashboard |
| ✅ | Automated tests for grading logic and mastery-stage transitions | P2 | Vitest — 13 tests covering `nextMasteryStage` transitions, `computeStreak`, and `shuffle` (`src/lib/practice/*.test.ts`) |
| ✅ | Naming decision (app name) + logo | P2 | Renamed to **Knack**; wordmark set in a distinct display font (Baloo 2), favicon matches the mascot |

---

# Design language (locked)

Settled via visual mockups. This is the handoff reference for the Phase 14 UI redesign.

**Color — one saturated color throughout:**
- Page/section background: yellow `#FFD43B` (fills areas fully — NOT pale cream behind white cards)
- Accent: orange `#F97316` (streaks, mic button, active emphasis)
- Text: near-black `#1A1A1A`; muted `#7A7A6E`; on-yellow dark gold `#4A3B00`
- Success `#3B9E5B`, error `#D64545`
- One color only — not per-screen colors.

**Card style (the signature look):** white background, 2.5px solid black border, hard offset shadow (`box-shadow: 4px 4px 0 #1A1A1A` big / `3px 3px 0` small), rounded 14–16px corners. Every clickable thing uses this so it reads as tappable. (Chosen as "Option B" over soft-fill and colored-border alternatives.)

**Buttons:** primary = solid black `#1A1A1A` + white text, rounded 14px. Secondary = white + 2px black border.

**Pills:** active nav item + status labels = black pill, yellow text. Level/register/tag pills = rounded-full, soft tinted background with dark same-family text.

**Layout rules:**
- No page scrolling on exercise screens — fit one viewport. Pattern: compact top row (exercise-type pill + level pill + progress) → content card(s) → bottom action bar. Use grids (e.g. 2×2 options) to fit.
- Header integrated into the colored page with a bold 2.5px black bottom divider — NOT a floating white bar.

**Per-screen notes:**
- Speaking: large circular mic button (orange, black border, offset shadow); examiner turns in white cards; user's spoken reply in a contrasting dark bubble.
- Scenario writing: German prompt card with Leitpunkte as pill tags; register shown in the level pill (e.g. "B1 · Sie"); help words hidden behind a "💡 Wörter anzeigen" button.
- Reading: passage card with stretch words softly highlighted; comprehension question tests meaning/inference; "My words / Level practice" toggle pill top-right.

**Mascot:** potato, added as final art step. Leave marked placeholder image slots (hero/avatar spots) during the restyle.

**Keep:** the existing rounded chunky corners and fonts — those were already good.

---

# Data model

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
