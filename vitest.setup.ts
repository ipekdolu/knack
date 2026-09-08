import { config } from "dotenv";

// Tests import server-action modules that construct a DB client at module
// load time (see src/db/index.ts) even though the pure functions under test
// never issue a query. Loading the same env file the app uses keeps that
// constructor from choking on a missing DATABASE_URL.
config({ path: ".env.local", quiet: true });
