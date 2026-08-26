import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

export const storyStatus = pgEnum("story_status", [
  "created",
  "analyzing",
  "analysis_failed",
  "cast_review",
  "voice_generation",
  "visual_generation",
  "assembling",
  "ready",
  "failed",
]);

export const jobStatus = pgEnum("job_status", ["queued", "running", "completed", "failed"]);

export const assetKind = pgEnum("asset_kind", ["audio", "image", "svmp", "manifest"]);

export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  /** Raw text as pasted by the user. */
  source_text: text("source_text").notNull(),
  source_url: text("source_url"),
  /** Sanitized/normalized text produced by the Phase 1 sanitizer. */
  sanitized_text: text("sanitized_text"),
  status: storyStatus("status").notNull().default("created"),
  /** True when the user chose to skip the voice stage for this story. */
  voice_skipped: boolean("voice_skipped").notNull().default(false),
  /** True when the user chose to skip the visual stage for this story. */
  visual_skipped: boolean("visual_skipped").notNull().default(false),
  /** Analysis model that produced the story manifest (e.g. gemini-3.1-pro-preview or kimi-k3). */
  analysis_model: text("analysis_model"),
  /** Provider that succeeded for analysis: "gemini" | "kimi" | null. */
  analysis_provider: text("analysis_provider"),
  /** Which pipeline stage failed when status is "failed": "voice" | "visual" | null. */
  failed_stage: text("failed_stage"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  story_id: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  payload: jsonb("payload"),
  result: jsonb("result"),
  error: text("error"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  story_id: uuid("story_id")
    .notNull()
    .references(() => stories.id, { onDelete: "cascade" }),
  /** Id from StoryManifest.characters[].id. */
  character_id: text("character_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  /** Serialized CharacterBible (packages/schemas). */
  bible: jsonb("bible").notNull(),
  version: integer("version").notNull().default(1),
  approved_at: timestamp("approved_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scenes = pgTable("scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  story_id: uuid("story_id")
    .notNull()
    .references(() => stories.id, { onDelete: "cascade" }),
  /** Id from StoryManifest.scenes[].id. */
  scene_id: text("scene_id").notNull(),
  order: integer("order").notNull(),
  /** Serialized SceneManifest (packages/schemas). */
  data: jsonb("data").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  story_id: uuid("story_id")
    .notNull()
    .references(() => stories.id, { onDelete: "cascade" }),
  kind: assetKind("kind").notNull(),
  /** Object key in the R2 bucket. */
  r2_key: text("r2_key").notNull(),
  content_type: text("content_type"),
  size_bytes: integer("size_bytes"),
  meta: jsonb("meta"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
export type SceneRow = typeof scenes.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;