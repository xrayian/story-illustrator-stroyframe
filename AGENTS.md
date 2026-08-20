# Project: Storyframe (working name)

Story-to-audio-visual media generator: paste a story, get an illustrated, narrated,
redistributable media bundle (.svmp).

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind v4, Turbopack
- Postgres via Drizzle ORM (Neon)
- Object storage: Cloudflare R2 (S3-compatible)
- Job queue: BullMQ + Upstash Redis
- External APIs: Gemini (analysis + image generation), ElevenLabs (Voice Design v3, TTS)
- Schemas: Zod v4 (shared across web + worker)

## Conventions

- Shared types/schemas live in packages/schemas (Zod), imported by both the web app
  and the worker — never duplicate a schema.
- Build mode only for anything that calls a paid Gemini/ElevenLabs endpoint, and only
  after the Phase 2 cast-review approval gate has fired for that story.
- AI-inferred character demographic fields must trace to explicit text evidence.
  Leave a field "unspecified" rather than guess — this is a hard rule, not a style
  preference.
- docs/svmp-format.md is the source of truth for the bundle format. Keep the
  writer/reader/player in sync with it whenever the schema changes.
- plan.md is the working build log; update it as phases progress.
- Env vars (canonical names): NEON_CONN_STRING, UPSTASH_REDIS_URL, R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, GEMINI_API_KEY, ELEVENLABS_API_KEY.

## Budget

- Draft tier: $3/story ceiling (flash models)
- Premium tier: $10/story ceiling (pro models)
- Phase 8 will enforce these; do not exceed without explicit user confirmation.

## Commands

```
pnpm dev          # web (Next.js) + worker (BullMQ)
pnpm test         # Vitest suite
pnpm db:generate  # Drizzle schema -> SQL
pnpm db:migrate   # apply migrations
pnpm typecheck    # TS across all packages
```

## Do not

- Do not hardcode API keys — read from env, fail loudly if missing.
- Do not skip the cast-review approval gate before triggering paid generation.
- Do not let the analysis prompt infer ethnicity/race from a name alone.