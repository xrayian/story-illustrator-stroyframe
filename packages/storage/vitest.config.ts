import { config } from "dotenv";

// Root .env lives two levels up from this package's working directory.
config({ path: "../../.env" });

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});