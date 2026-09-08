# Knack

A German vocabulary trainer that goes beyond flashcards: flashcards and
fill-in-the-blank for recognition, plus sentence writing, short reading
passages, scenario writing, and a live spoken conversation -- each graded by
Claude with specific, in-context feedback instead of a right/wrong checkmark.

## Stack

- **Next.js 16 (App Router, Turbopack)** + TypeScript + React 19
- **Tailwind CSS v4** -- CSS-based `@theme` tokens, no `tailwind.config.ts`
- **Supabase** -- Google OAuth (Supabase Auth) + Postgres, with Row Level
  Security on every table
- **Drizzle ORM** -- schema-first migrations (`drizzle/`)
- **Anthropic Claude API** -- `claude-opus-5` for judgment-heavy generation/
  grading, `claude-haiku-4-5` for cheap calls (hints, glosses)
- **Web Speech API** -- in-browser speech-to-text and text-to-speech for the
  Speaking exercise (no external speech vendor)
- **Vitest** -- unit tests for the pure grading/mastery logic

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run db:migrate           # apply schema to your Supabase Postgres
npm run db:seed              # load the Goethe-Institut word lists
npm run dev
```

Required environment variables (`.env.local`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase project settings) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Claude API key |

Google OAuth must be enabled in the Supabase Auth dashboard, with
`http://localhost:3000/auth/callback` (and your deployed URL) as an
authorized redirect.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm test` | Run the Vitest suite |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a new migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load the seed word list into `words` |
| `npm run db:studio` | Drizzle Studio (browse the DB) |

## Architecture

```
src/app/(app)/          Authenticated routes -- Home, Vocabulary, Activities,
                         Settings. AppLayout does the auth check + shell.
src/app/login, /auth     OAuth sign-in and callback handling.
src/app/page.tsx         Public landing page.

src/components/ui/       Design-system primitives (Card, Button, Pill,
                         AnswerOption, the mascot SVG, ...) -- styling only,
                         no data-fetching.
src/components/          exercise-session.tsx: the shared flashcard/
                         fill-blank session component reused by every
                         Vocabulary and Activities entry point that needs one.

src/lib/practice/        Server actions (`"use server"`), one file per
                         concern: actions.ts (sessions, dashboard stats,
                         flashcard/fill-blank generation), grading.ts
                         (sentence grading + hints), reading.ts, scenario.ts,
                         conversation.ts (speaking), content-cache.ts
                         (caches generated exercise content per word so
                         repeat reviews don't re-hit Claude), shared.ts
                         (mastery-stage/SRS logic, auth helper).
src/lib/claude/client.ts Centralized Anthropic client construction (explicit
                         timeout + retries) and error translation, so every
                         call site gets the same friendly-error handling.
src/lib/speech/          Web Speech API hooks (recognition + synthesis).
src/lib/supabase/        Browser/server Supabase clients.

src/db/schema.ts         Drizzle schema -- source of truth for the DB.
drizzle/                 Generated SQL migrations.
scripts/seed-words.ts    One-off seed script for the Goethe-Institut lists.
```

### Data model (short version)

- `words` -- the vocabulary bank, seeded by level (A1-C1) plus any
  user-added words.
- `user_word_progress` -- one row per (user, word): mastery stage
  (new/learning/mastered), spaced-repetition due date, streaks.
- `word_content` -- generated exercise content (flashcard sentences,
  fill-blank items) cached per word, several variants deep, so the same
  word doesn't always show identical material.
- `exercise_log` -- every attempt across every exercise type, with
  Claude's feedback stored as JSON for later review.
- `user_settings` -- level, cards/session, display name.

### Notable decisions

- **Mastery model resets on a miss** rather than just slowing down: any
  incorrect answer drops a word back toward "new" (mastered -> learning,
  learning/new -> new). This is deliberately aggressive -- the app is about
  actually knowing a word, not about a streak counter that survives repeated
  mistakes.
- **Content caching over regeneration**: exercise content (flashback
  sentences, fill-blank items, reading passages) is generated once per word
  and cached, with an occasional chance of a fresh variant. Keeps Claude API
  cost and latency down without every review looking identical.
- **Server actions, not a REST API**: every Claude call and DB write is a
  Next.js server action gated by `requireUser()`, which re-checks the
  Supabase session on every call rather than trusting a client-supplied
  user ID.
- **Speech stays client-side**: the Speaking exercise uses the browser's
  own Web Speech API instead of a server-side transcription vendor --
  no audio ever leaves the browser except as text, and there's no per-call
  transcription cost.

## Security

- **Row Level Security** is enabled on every table (`drizzle/0001`,
  `0003`, `0006`, `0009`), scoped to `auth.uid()` -- a user's queries can
  only see their own rows, even if the Supabase anon key leaked.
- **Auth is Google OAuth via Supabase**, no passwords stored by this app.
- **Every server action re-derives the user** from the session
  (`requireUser()`) rather than trusting an ID passed from the client.
- **Claude API calls are server-only** -- the API key never reaches the
  browser.
- Not yet done: per-user rate limiting on Claude-backed actions, and a
  dependency-vulnerability sweep (see `npm audit`).

## Known gaps / not done

- No production deploy target wired up yet (dev/prod env separation
  deferred until that's decided).
- No analytics/usage dashboard beyond the per-user stats on the Home page.
- Single-user-in-mind features (missions/points) were tried and removed;
  the schema tables still exist but are unused.
