import { createDb, type Db } from "@storyframe/schemas/db";
import { getEnv } from "./env";

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) cached = createDb(getEnv().NEON_CONN_STRING);
  return cached;
}