import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/** Neon HTTP client. Serverless-friendly; works on Vercel and in the worker. */
export function createDb(connectionString: string) {
  const client = neon(connectionString);
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

export * from "./schema";