# Project: Storyframe (working name)

Story-to-audio-visual media generator: paste a story, get an illustrated, narrated,
redistributable media bundle (.svmp).

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind v4, Turbopack
- Postgres via Drizzle ORM (Neon)
- Object storage: Cloudflare R2 (S3-compatible)
- Job queue: BullMQ + Upstash Redis
- External APIs: Gemini (analysis + image generation), ElevenLabs (Voice Design v3, TTS), Pruna P-API (image generation), Edge TTS (free voice synthesis)
- Schemas: Zod v4 (shared across web + worker)

## Conventions

- Shared types/schemas live in packages/schemas (Zod), imported by both the web app
  and the worker — never duplicate a schema.
- Build mode only for anything that calls a paid Gemini/ElevenLabs endpoint, and only
  after the Phase 2 cast-review approval gate has fired for that story.
- AI-inferred character demographic fields: infer freely from context clues (dialogue,
  descriptions, names, cultural references, setting). Only leave "unspecified" when there
  is genuinely zero signal. The one forbidden inference: do NOT assume ethnicity/race
  solely from a name.
- docs/svmp-format.md is the source of truth for the bundle format. Keep the
  writer/reader/player in sync with it whenever the schema changes.
- plan.md is the working build log; update it as phases progress.
- Env vars (canonical names): NEON_CONN_STRING, UPSTASH_REDIS_URL, R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, GEMINI_API_KEY, ELEVENLABS_API_KEY.
  Optional: GEMINI_ANALYSIS_MODEL (default gemini-3.5-flash) for Gemini analysis (PRIMARY),
  HF_TOKEN + HF_IMAGE_MODEL (Hugging Face image fallback, default
  black-forest-labs/flux.1-schnell), POLLINATIONS_IMAGE_MODEL (default flux),
  MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET + MODAL_QWEN_BASE_URL
  (default https://xrayian--ep-qwen3-8-2-4t-a95b-server.us-west.modal.direct/v1) +
  MODAL_QWEN_MODEL (default Qwen/Qwen3.8-2.4T-A95B) for Qwen3.8 analysis fallback.
  MODAL_KIMI_BASE_URL (default https://xrayian--ep-kimi-k3-server.us-west.modal.direct/v1) +
  MODAL_KIMI_MODEL (default kimi-k3) for Kimi K3 analysis fallback when Qwen is unavailable.
  PRUNA_API_KEY + PRUNA_IMAGE_MODEL (default p-image) + PRUNA_API_BASE_URL
  (default https://api.pruna.ai) for Pruna P-API image generation (primary).
  EDGE_TTS_RATE (default "+0%") for Edge TTS voice rate adjustment.

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