# Storyframe

> Paste a story, get an illustrated, narrated, redistributable media bundle (`.svmp`).

Storyframe is a story-to-audio-visual generator. Drop in a story, approve the inferred cast, and Storyframe produces a self-contained bundle you can play offline or share — no platform lock-in.

```
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌──────────────┐    ┌──────────────┐
│  Paste   │ →  │  Gemini    │ →  │  Cast      │ →  │  ElevenLabs  │ →  │  Bundle      │
│  story   │    │  analysis  │    │  review    │    │  + HF/Gemini │    │  (.svmp)     │
└──────────┘    └────────────┘    └────────────┘    └──────────────┘    └──────────────┘
                   │                                      │
                   └────── $0 fallback: Pollinations ────┘
```

---

## Features

- **AI-analyzed structure** — Gemini extracts characters, scenes, and cues. Inferred demographics only land where the story supports them.
- **Cast-review gate** — nothing is generated until you approve the cast. Edit names, roles, and physical descriptions before voice or visual work begins.
- **Per-character voices** — ElevenLabs Voice Design v3 gives every character and the narrator a distinct voice. Skip narration if you prefer.
- **Illustrated scenes** — reference portraits re-anchor every scene for visual consistency, with Gemini → Hugging Face → Pollinations fallback.
- **Redistributable bundles** — finished `.svmp` files are self-contained zips: manifest, audio, illustrations, captions. Play them from this app or offline in any browser.
- **Light + dark themes** with persistent preference.
- **Multi-provider fallback** — image generation walks a paid → paid → free provider chain so the pipeline degrades gracefully on quota or billing errors.

---

## Stack

| Layer        | Tech                                                                |
| ------------ | ------------------------------------------------------------------- |
| Web          | Next.js 16 (App Router) + TypeScript + Tailwind v4 + Turbopack      |
| Worker       | BullMQ + Upstash Redis                                              |
| Database     | Postgres (Neon) via Drizzle ORM                                     |
| Storage      | Cloudflare R2 (S3-compatible)                                       |
| AI — text    | Gemini (`gemini-3.1-pro-preview`, `gemini-3.5-flash` fallback)      |
| AI — image   | Gemini → Hugging Face (Inference Providers, `provider: "auto"`) → Pollinations |
| AI — voice   | ElevenLabs Voice Design v3 + TTS                                    |
| Schemas      | Zod v4, shared across web + worker                                  |

---

## Quickstart

### 1. Clone & install

```bash
pnpm install
```

### 2. Provision services

| Service          | Why                                | Free tier                          |
| ---------------- | ---------------------------------- | ---------------------------------- |
| Neon             | Postgres database                  | Yes                                |
| Upstash Redis    | BullMQ queue                       | Yes                                |
| Cloudflare R2    | Asset storage (audio + images)     | Yes                                |
| Google AI Studio | Gemini analysis + image generation | Free tier, then metered            |
| Hugging Face     | Optional image fallback            | Free tier with `hf_…` token        |
| Pollinations     | Free image fallback (no key)       | Free, no signup                    |
| ElevenLabs       | Voice design + TTS                 | Trial credits                      |

### 3. Configure env

```bash
cp .env.example .env
# Fill in the keys above
```

The optional HF_TOKEN / Hugging Face image hop is enabled whenever `HF_TOKEN` is present; without it the chain skips straight from Gemini to Pollinations.

### 4. Run the database

```bash
pnpm db:generate    # Drizzle schema -> SQL
pnpm db:migrate     # apply migrations
```

### 5. Dev

```bash
pnpm dev            # web (Next.js) + worker (BullMQ)
```

Open [http://localhost:3000](http://localhost:3000), paste a story, and watch the pipeline.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              apps/web (Next.js)                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────────┐│
│  │  /      │ │ /stories│ │  /play  │ │ /api/*  │ │ React + Tailwind v4 ││
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────────────┘│
└────────────────────────┬────────────────────────────────────────────────┘
                         │ fetch /api/*
┌────────────────────────┴────────────────────────────────────────────────┐
│                    API routes (apps/web/src/app/api/...)                │
│  stories · cast/approve · voice/{previews,select,narrate,skip}         │
│  visuals/{generate,skip,asset} · bundle                                │
└──────────┬─────────────────────────┬──────────────────────┬──────────────┘
           │ Drizzle                  │ R2 (S3 SDK)          │ BullMQ enqueue
┌──────────┴────────────┐ ┌───────────┴────────────┐ ┌──────┴──────────────┐
│ packages/schemas      │ │ packages/storage       │ │   worker           │
│ Zod + DB schema + env │ │ R2 upload/presign      │ │   BullMQ consumer   │
└───────────────────────┘ └────────────────────────┘ └──────┬──────────────┘
                                                             │
                              ┌──────────────────────────────┴──────────┐
                              │           packages/pipeline              │
                              │  analyze → cast → voice → visuals →     │
                              │  assemble (.svmp writer)                │
                              └──────┬──────────────┬──────────────┬─────┘
                                     │              │              │
                              ┌──────┴─────┐ ┌──────┴────┐ ┌──────┴──────┐
                              │  Gemini    │ │ElevenLabs │ │  HF /       │
                              │            │ │           │ │ Pollinations│
                              └────────────┘ └───────────┘ └─────────────┘
```

- **apps/web** — Next.js 16 App Router. Server Components for routes, client components for stateful UI. All Schemas via `packages/schemas`.
- **worker** — BullMQ consumer that runs the multi-phase pipeline. Same `packages/pipeline` code as the web build.
- **packages/pipeline** — pure logic. No I/O outside the boundaries it gets passed (DB rows, R2 client, AI clients). Tested in isolation.
- **packages/svmp** — bundle format reader/writer (`docs/svmp-format.md` is source of truth).
- **packages/storage** — R2 helpers (upload, presigned URLs).
- **packages/schemas** — shared Zod schemas + Drizzle DB schema + env validation.

---

## Repo layout

```
storylib/
├── apps/
│   └── web/                     # Next.js app
│       ├── src/app/             # App Router routes + API
│       └── src/components/      # React components
├── worker/                      # BullMQ worker
├── packages/
│   ├── pipeline/                # Story pipeline (analyze → assemble)
│   ├── schemas/                 # Zod schemas, Drizzle DB schema, env
│   ├── storage/                 # Cloudflare R2 helpers
│   └── svmp/                    # Bundle format reader/writer
├── docs/
│   └── svmp-format.md           # Bundle format spec
├── plan.md                      # Build log + roadmap
└── AGENTS.md                    # Project conventions for AI agents
```

---

## Phases

| Phase | Name                     | Status     |
| ----- | ------------------------ | ---------- |
| 1     | Ingest + Gemini analysis | ✅ shipped |
| 2     | Story page + cast review | ✅ shipped |
| 3     | Voice design + narration | ✅ shipped |
| 4     | Visual pipeline          | ✅ shipped |
| 5     | Bundle assembler         | ✅ shipped |
| 6     | Hosted + drag-drop player | ✅ shipped |
| 7     | Library + per-stage progress | ✅ shipped |
| 8     | Local TTS fallback for non-audio files | ⏳ planned |

See [`plan.md`](./plan.md) for the running build log and Phase 8 notes.

---

## Environment variables

Canonical names (see [AGENTS.md](./AGENTS.md) and `.env.example`):

| Var                       | Required        | Default                       | Purpose                              |
| ------------------------- | --------------- | ----------------------------- | ------------------------------------ |
| `NEON_CONN_STRING`        | yes             | —                             | Postgres                             |
| `UPSTASH_REDIS_URL`       | yes             | —                             | BullMQ broker                        |
| `R2_ACCOUNT_ID`           | yes             | —                             | R2                                   |
| `R2_ACCESS_KEY_ID`        | yes             | —                             | R2                                   |
| `R2_SECRET_ACCESS_KEY`    | yes             | —                             | R2                                   |
| `R2_BUCKET`               | yes             | —                             | R2                                   |
| `GEMINI_API_KEY`          | yes             | —                             | Gemini text + image                  |
| `GEMINI_ANALYSIS_MODEL`   | no              | `gemini-3.1-pro-preview`      | Cast/scene extraction model          |
| `ELEVENLABS_API_KEY`      | for narration   | —                             | Voice design + TTS                   |
| `HF_TOKEN`                | no              | —                             | Middle image fallback (HF)           |
| `HF_IMAGE_MODEL`          | no              | `black-forest-labs/flux.1-schnell` | Model routed via Inference Providers |
| `POLLINATIONS_IMAGE_MODEL` | no              | `flux`                        | Free fallback model                  |

If `ELEVENLABS_API_KEY` is missing, the pipeline skips narration automatically (you can also skip it manually per-story). If `HF_TOKEN` is missing, the chain walks Gemini → Pollinations directly.

---

## Dev commands

```bash
pnpm dev          # web (Next.js) + worker (BullMQ)
pnpm test         # Vitest suite
pnpm typecheck    # TS across all packages
pnpm db:generate  # Drizzle schema -> SQL
pnpm db:migrate   # apply migrations
pnpm --filter @storyframe/web lint
pnpm --filter @storyframe/web build
```

---

## Bundle format (`.svmp`)

`.svmp` is a ZIP containing:

- `manifest.json` — story metadata, characters, scenes, voice mapping
- `audio/scene-N.mp3` — per-scene narration
- `illustrations/scene-N.jpg` — scene illustrations
- `portraits/<character-id>.jpg` — character reference portraits
- `cues.json` — caption timing per scene

The full spec is in [`docs/svmp-format.md`](./docs/svmp-format.md). `packages/svmp` implements the reader/writer.

---

## Conventions

See [`AGENTS.md`](./AGENTS.md). Highlights:

- **Build mode only** for anything that calls a paid Gemini/ElevenLabs endpoint, and only after the Phase 2 cast-review approval gate has fired for that story.
- **AI-inferred character demographic fields: infer freely from context clues (dialogue, descriptions, names, cultural references, setting).** Only leave "unspecified" when there is genuinely zero signal. The one forbidden inference: do NOT assume ethnicity/race solely from a name.
- **Shared types/schemas live in `packages/schemas`** (Zod). Imported by both the web app and the worker — never duplicate a schema.
- **`docs/svmp-format.md` is the source of truth** for the bundle format. Keep the writer/reader/player in sync whenever the schema changes.
- Do not hardcode API keys — read from env, fail loudly if missing.

---

## License

MIT — see [LICENSE](./LICENSE) (TBD).
