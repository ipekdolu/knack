# Knack 🥔

A German vocabulary trainer that checks how you actually use words instead of whether you can recognize them on a flashcard.

Most vocab apps stop at flashcards. Knack also has you write sentences, read short passages, write scenario texts (like a complaint email), and hold a spoken conversation with an AI examiner. Each of those gets real feedback on what you got right and wrong, not just a checkmark.

Live demo: [knackde-azure.vercel.app](https://knackde-azure.vercel.app)

## What it does

- Flashcards and fill-in-the-blank for quick recognition practice.
- Writing exercises: write a sentence, or a longer scenario text like a complaint email. These are graded on the criteria the Goethe/telc exams actually use (task completion, coherence, vocabulary, grammar), including whether you got the du/Sie register right.
- Reading: passages at your level with a few harder words mixed in, and comprehension questions that test whether you understood the text rather than whether you can spot a familiar word.
- Speaking: a back-and-forth spoken conversation with an AI examiner, in German, based on how the CEFR oral exams are structured, with feedback at the end.
- Spaced repetition and progress tracking from A1 to C1, plus streaks.

## Built with

Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS v4, Supabase (Postgres + Google OAuth), Drizzle ORM, the Anthropic API, the Web Speech API, and Vercel.

## Some decisions worth explaining

The framework choices are standard. These were the calls that took some thought:

- Grading looks at how a word is used, not whether a specific string appears. Open answers go to the model with a rubric based on the real exam criteria, and it returns structured feedback with corrections and a score.
- A wrong answer sends a word back toward "new" instead of just slowing its review down. The point is to know the word, not to protect a streak.
- Generated exercise content is cached per word and reused, with a small chance of a new variant, so the API cost and load times stay down without every review looking the same.
- Different tasks use different models: grading runs on the strongest one, content generation on a faster one, and cheap things like hints on the cheapest.
- Every server action re-checks who the user is from their session rather than trusting an ID sent from the browser, and Row Level Security is on for every table, so a leaked key still can't read someone else's data.
- Speech recognition happens in the browser with the Web Speech API, so no audio is sent to a server and there's no per-call transcription cost.

## Running it locally

Install dependencies, copy `.env.example` to `.env.local` and fill in the values, then apply the database schema and start the dev server:

    npm install
    cp .env.example .env.local
    npm run db:migrate
    npm run db:seed
    npm run dev

Environment variables you'll need:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

You'll also need Google OAuth enabled in the Supabase Auth dashboard, with `<your-url>/auth/callback` set as an authorized redirect.
