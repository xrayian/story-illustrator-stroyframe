import { createHash } from "node:crypto";

/** SHA-256 hex digest of a buffer. */
export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Paths whose checksums are NOT recorded (see docs/svmp-format.md). */
export const EXCLUDED_PATHS = new Set<string>(["manifest.json", "checksums.json"]);
