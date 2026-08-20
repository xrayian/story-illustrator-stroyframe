import { config } from "dotenv";

// Root .env lives two levels up from this package's working directory.
config({ path: "../../.env" });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.NEON_CONN_STRING ?? "",
  },
});