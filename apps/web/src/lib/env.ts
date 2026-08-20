import { config } from "dotenv";

// Local dev: the root .env lives two levels above apps/web.
config({ path: "../../.env" });

import { validateEnv, type Env } from "@storyframe/schemas/env";

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = validateEnv(process.env);
  return cached;
}