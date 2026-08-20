# Build Log — Storyframe

Working name: **Storyframe** — story-to-audio-visual media engine.
Format: `.svmp`. Source of truth for the plan: `init.md`.

## Locked decisions (Phase 0 kickoff, 2026-08-20)

- **Scope of this session:** Phase 0 scaffold only.
- **Stack:** Next.js 16.3 (App Router, TS, Tailwind v4, Turbopack), pnpm workspaces,
  Node 22. Next.js 15 (per init.md) is stale — its LTS ends Oct 2026; scaffolding on 16.
- **DB:** Neon Postgres via Drizzle ORM (`drizzle-orm@0.45` stable + `drizzle-kit`),
  `neon-http` driver. Env var: `NEON_CONN_STRING`.
- **Storage:** Cloudflare R2 via `@aws-sdk/client-s3`. Bucket `storyframe`.
- **Queue:** BullMQ + Upstash Redis. Env var: `UPSTASH_REDIS_URL` (`rediss://` TLS).
- **Schemas:** Zod v4, `z.toJSONSchema()` for Gemini `response_format` later.
- **Tests:** Vitest.
- **Budget caps:** Draft $3/story, Premium $10/story (enforced in Phase 8).
- **i18n / multi-language dubbing:** out of scope for MVP; format versioned to allow later.
- **Bundle ext / name:** keep `.svmp` and Storyframe.

## Environment readiness (verified 2026-08-20)

All 8 required env vars present in `.env` and well-formed:
`NEON_CONN_STRING`, `UPSTASH_REDIS_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`.

Reachability probes (TCP): Neon :5432 OK, Upstash :6379 OK, R2 :443 OK.
Auth validated via DB smoke test + queue no-op job during this phase.

## Phase 0 — Scaffold (in progress)

Tasks:
- [ ] git init + root workspace files (pnpm-workspace.yaml, .npmrc, .gitignore, root package.json)
- [ ] AGENTS.md + plan.md created
- [ ] apps/web — Next.js 16 scaffold
- [ ] packages/schemas — Zod schemas (StoryManifest, CharacterBible, SceneManifest) + toJSONSchema + Vitest round-trip
- [ ] Env validation (Zod) + .env.example
- [ ] Drizzle — tables stories/jobs/characters/scenes/assets, config, first migration, DB smoke test
- [ ] packages/storage — R2 typed upload/download/delete
- [ ] worker — BullMQ queue + no-op job
- [ ] Root scripts (dev/test/db:generate/db:migrate/typecheck)

Acceptance:
- [ ] pnpm dev boots web + worker
- [ ] pnpm db:migrate runs clean
- [ ] pnpm test passes (schema round-trip + stories create/read)
- [ ] No-op BullMQ job completes end to end