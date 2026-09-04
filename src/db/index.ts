import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// In dev, Next's hot-reload re-executes this module on every change. Without
// caching the client on globalThis, each reload opens a new postgres
// connection without closing the old one, eventually exhausting Supabase's
// session-pooler connection limit.
const globalForDb = globalThis as unknown as {
  postgresClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.postgresClient ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = drizzle(client, { schema });
