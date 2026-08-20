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

## Phase 0 — Scaffold (COMPLETE 2026-08-20)

Tasks:
- [x] git init + root workspace files (pnpm-workspace.yaml, .npmrc, .gitignore, root package.json)
- [x] AGENTS.md + plan.md created
- [x] apps/web — Next.js 16.3.1 scaffold (TS, Tailwind v4, Turbopack), transpilePackages wired
- [x] packages/schemas — Zod v4 schemas (StoryManifest, CharacterBible, SceneManifest)
      + toJSONSchema (draft 2020-12) exports + env validation + Vitest round-trip
- [x] Env validation (Zod, fails loudly) + .env.example
- [x] Drizzle — tables stories/jobs/characters/scenes/assets + story_status/job_status/asset_kind
      enums, config, first migration `0000_overjoyed_reaper.sql` APPLIED to Neon
- [x] packages/storage — R2 typed upload/download/exists/remove + storyAssetKey helper
- [x] worker — BullMQ queue 'pipeline' + noop job; ioredis TLS to Upstash
- [x] Root scripts (dev/test/db:generate/db:migrate/typecheck)

Acceptance — all met:
- [x] pnpm dev boots web + worker (Next Ready in 3.8s; worker listening on 'pipeline')
- [x] pnpm db:migrate runs clean (Neon)
- [x] pnpm test passes: 13 schema/DB tests + 2 R2 round-trip tests (live bucket)
- [x] No-op BullMQ job completes end to end (job 1 noop completed via Upstash)

Verification notes:
- create-next-app needs its parent dir to exist before running (its isWriteable
  check fails on a nonexistent parent) — mkdir apps first next time.
- create-next-app emits a nested apps/web/pnpm-workspace.yaml; moved its
  ignoredBuiltDependencies to the root workspace file to keep one workspace root.

## Next: Phase 1 — Ingestion & analysis engine