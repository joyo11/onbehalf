import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local and Vercel.");
}

// In dev, reuse a single client across HMR reloads so we don't exhaust connections.
// In prod/serverless, one client per cold start is fine.
declare global {
  // eslint-disable-next-line no-var
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

const client =
  global.__dbClient ??
  postgres(connectionString, {
    prepare: false, // required for Supabase pooler
    max: 1, // serverless: keep small
  });

if (process.env.NODE_ENV !== "production") {
  global.__dbClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
