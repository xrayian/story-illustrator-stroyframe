# Story-to-Audio-Visual Media Engine — Build Plan

**Working name:** Storyframe *(rename freely — search/replace in AGENTS.md once you pick one)*

**Format name:** `.svmp` — Story Visual Media Package

**Target:** Next.js web app, shareable-link playback, custom portable bundle format

**Scope:** MVP pipeline + a basic library to store and replay past generations

This document is written to be dropped straight into an OpenCode project and worked phase-by-phase: run **Plan mode** on a phase to sanity-check the approach against your actual repo, then **Build mode** to execute it. Each phase has its own acceptance criteria so you know when to move on.

---

## 1. What it does, end to end

1. You paste raw story text (Wattpad, Facebook, wherever) into a form.
2. Gemini reads the whole thing and produces a structured breakdown: every character, every scene, who's speaking in every line, and which scenes are visually worth illustrating.
3. You review and edit the cast list before anything paid happens — this is the one mandatory human checkpoint in the pipeline.
4. ElevenLabs designs a distinct voice for every character (and the narrator) from a text description, then narrates every line.
5. Nano Banana generates a locked reference portrait for each character, then illustrates key scenes, reusing those reference images so everyone stays visually consistent from scene to scene.
6. Everything gets packaged into a single `.svmp` file — text, timed audio, images, captions, and a manifest — that a lightweight player can open and replay forever without touching the network or spending another cent.
7. Finished bundles live in a personal library you can reopen, download, or share a link to.

---

## 2. Architecture

```
Next.js app (App Router, TypeScript)
├── apps/web            → UI: paste form, cast review, library, player
├── packages/pipeline    → orchestration: analysis → voice → visual → assembly
├── packages/schemas     → shared Zod schemas (StoryManifest, CharacterBible, SceneManifest)
├── packages/svmp        → .svmp writer/reader (used by both pipeline and player)
└── worker                → BullMQ jobs, one per pipeline stage, resumable
```

- **Web/UI + API routes:** Next.js 15, TypeScript, Tailwind
- **Database:** Postgres (Neon or Supabase) via Drizzle ORM — stores stories, jobs, character bibles, scene metadata
- **Object storage:** Cloudflare R2 (S3-compatible) — stores generated audio, images, and finished `.svmp` files
- **Job queue:** BullMQ + Upstash Redis — the pipeline is slow (many external API calls), so it runs as background jobs the UI polls, not a blocking request
- **External APIs:** Gemini API (analysis + image generation), ElevenLabs API (voice design + narration)

This matches your existing Next.js / Node stack, so the web layer and the worker can share the same TypeScript schemas package without a language boundary.

---

## 3. External API notes (accurate as of this plan's writing — verify against docs before locking in, these move fast)

**Gemini — text analysis**

- Use `gemini-3.1-pro-preview` for the main analysis pass (character/scene/speaker extraction needs its stronger reasoning for pronoun and coreference resolution across a long story). Use a cheaper `gemini-3.5-flash` pass for lighter downstream tasks like caption cleanup.
- Force structured output with `response_format: { type: "text", mime_type: "application/json", schema: <your Zod-derived JSON schema> }`. This constrains generation token-by-token so you get valid JSON matching your schema, not a best-effort string to parse.

**Gemini — image generation ("Nano Banana")**

- Three tiers exist: `gemini-3.1-flash-image` (Nano Banana 2 — fast, ~$0.02–0.04/image, good default for most scenes), `gemini-3-pro-image-preview` (Nano Banana Pro — higher fidelity, ~$0.134 at 2K, best identity-locking across a cast), and the legacy `gemini-2.5-flash-image`.
- Both current models can hold up to **5 characters' identities and 14 reference objects/images consistent** across a generation. Use this directly: pass each present character's locked reference portrait as an input image alongside the scene prompt, every time.
- Images carry an invisible SynthID watermark by default — no action needed, it's automatic and not something to strip.

**ElevenLabs — voice design + narration**

- Voice Design (`POST /v1/text-to-voice/design`, model `eleven_ttv_v3`) takes a 20–1000 character natural-language description — age, gender, accent, tone, pacing — and returns 3 distinct voice previews. `POST /v1/text-to-voice/create` saves the chosen preview as a permanent `voice_id` in your library.
- For narration, `eleven_v3` gives the widest emotional/expressive range; use `eleven_flash_v2_5` for cheap draft passes during development (~75ms latency, noticeably lower quality).
- Request character-level timestamps on TTS calls — this is what lets you sync captions and Ken-Burns image pans to the actual spoken audio instead of guessing.
- ElevenLabs also supports multi-speaker dialogue generation natively if you want to explore rendering a whole scene's dialogue in one call later, rather than line-by-line.

---

## 4. Data model

### `StoryManifest` (output of the analysis stage)

```ts
{
  title: string
  characters: { id, name, aliases[], role }[]
  scenes: {
    id, order, setting, time_of_day, mood,
    is_key_scene: boolean,          // drives illustration budget
    characters_present: string[],   // character ids
    lines: { id, speaker_id | "narrator", text, emotion_tag? }[]
  }[]
}
```

### `CharacterBible` (built from StoryManifest, user-editable before locking)

```ts
{
  id, name, role,
  apparent_age_range: string | "unspecified",
  gender_expression: string | "unspecified",
  ethnicity_or_culture_cues: string | "unspecified",  // only if explicit in text
  physical_description: string,
  personality_traits: string[],
  voice_id: string | null,          // ElevenLabs, set after Phase 3
  reference_image_url: string | null, // set after Phase 4
  locked_identity_prompt: string,   // used for both voice design and image gen
  version: number
}
```

### `.svmp` bundle (zip container)

```
mystory.svmp
├── manifest.json         # format_version, title, engine versions, duration, counts
├── characters.json        # CharacterBible[]
├── scenes/
│   ├── scene_001.json     # setting, mood, characters_present, image ref, line refs
│   └── ...
├── audio/
│   └── scene_001/
│       ├── line_0001.mp3
│       └── line_0001.timestamps.json
├── images/
│   ├── characters/char_<id>_ref.webp
│   └── scenes/scene_001.webp
├── captions/scene_001.vtt
└── checksums.json
```

`format_version` in the manifest is what lets the player handle future schema changes without breaking old bundles.

---

## 5. Bias, safety, and consent — design principles, not an afterthought

You specifically flagged race/age/gender awareness, so bake these in as hard rules, not UI copy:

- **Infer freely, but avoid name-based stereotyping.** The analysis prompt should infer demographic attributes from all available context (dialogue, descriptions, names, cultural references, setting). Only leave a field "unspecified" when there is genuinely zero signal. The one forbidden inference: do NOT assume ethnicity/race solely from a character's name.
- **Human-in-the-loop before spend.** The cast review gate (Phase 2) is the one mandatory stop in the pipeline. No voice design call and no image generation call fires until the user has seen and can edit every character's inferred attributes. This is also just good cost control.
- **User-filled, not auto-filled.** If a field is unspecified, the review UI shows an empty field with a placeholder, not a pre-filled guess the user has to notice and overturn.
- **Copyright reminder, not a copyright opinion.** Pasted text is user-supplied and may be someone else's copyrighted fiction (fanfic, published excerpts, etc.). Add a one-time notice at the input step reminding the user that redistributing the finished bundle is on them to have rights for — a checkbox, not a legal essay.
- **Content safety.** Rely on Gemini's and ElevenLabs' built-in safety filters as the backstop, but add a pre-check pass in Phase 8 that flags scenes likely to be rejected (explicit content, hate-themed material) before you spend generation budget on them.

---

## 6. Feature-flagged risk: cost

Nano Banana Pro at $0.134/image and ElevenLabs' character-metered TTS both add up fast on a full-length story. Phase 8 builds a pre-generation cost estimate and a Draft/Premium model tier toggle — treat that as required for MVP, not a nice-to-have, or your first long story will surprise you.

---

## 7. Phased task plan

Each phase lists concrete tasks as checkboxes and an acceptance test. Work through Plan mode first on each phase before flipping to Build mode.

### Phase 0 — Scaffold

- [ ] Init Next.js 15 (App Router, TS) with the monorepo layout in §2
- [ ] `packages/schemas`: Zod schemas for `StoryManifest`, `CharacterBible`, `SceneManifest`, generate JSON Schema from them for Gemini's `response_format`
- [ ] Postgres via Drizzle: tables `stories`, `jobs`, `characters`, `scenes`, `assets`
- [ ] R2 bucket wired up with a typed upload/download helper
- [ ] BullMQ + Upstash Redis queue scaffold with one no-op test job
- [ ] Env var validation at boot: `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `R2_*`
- **Acceptance:** `pnpm dev` boots, a migration runs clean, a test script can create and read back a `stories` row, the no-op job completes end to end.

### Phase 1 — Ingestion & analysis engine

- [ ] "Paste story" UI: textarea, optional title/source-URL, a rights-reminder checkbox per §5
- [ ] Text sanitizer: strip HTML/markdown cruft, repeated chapter boilerplate, ad artifacts common to Wattpad/Facebook copy-paste; normalize whitespace; detect language
- [ ] Chunking strategy for long stories: first pass on explicit chapter/scene break markers, fallback to a Gemini boundary-detection pass for unbroken text
- [ ] Analysis prompt (system instruction) enforcing: evidence-only character attributes, scene segmentation, per-line speaker attribution, `is_key_scene` flagging for illustration priority
- [ ] Call Gemini (`gemini-3.1-pro-preview`) with the `StoryManifest` JSON schema; handle schema-validation retries
- [ ] Persist `StoryManifest` to Postgres + R2
- **Acceptance:** a ~5,000-word test story returns a valid `StoryManifest` with correctly segmented scenes and speaker-attributed lines — spot-check on 3 varied sample stories (different genres/formats) before moving on.

### Phase 2 — Character bible + review UI

- [ ] Derive `CharacterBible` entries from `StoryManifest.characters`, resolving aliases/coreference into one entry per person
- [ ] Cast Review screen: editable fields per character, unspecified fields shown empty (never pre-filled with a guess)
- [ ] "Approve cast" action generates the `locked_identity_prompt` per character and freezes that version
- [ ] Version the bible (`version` field) so later edits don't destroy history or force a full regeneration
- **Acceptance:** no Gemini image call or ElevenLabs call can fire until a cast has been explicitly approved through this screen.

### Phase 3 — Voice pipeline

- [ ] Voice-description prompt generator from `CharacterBible` (age/gender/accent/tone/pacing sentence, 20–1000 chars)
- [ ] `POST /v1/text-to-voice/design` (`eleven_ttv_v3`) → 3 previews per character
- [ ] Casting Director UI: play previews, pick one (or "re-roll" for 3 new ones)
- [ ] `POST /v1/text-to-voice/create` to save the chosen preview; store `voice_id` on the `CharacterBible`
- [ ] Narrator gets the same flow as a pseudo-character
- [ ] Line-by-line TTS (`eleven_v3` for narration quality, `eleven_flash_v2_5` for draft/preview mode) with character-level timestamps requested
- [ ] Store audio + timestamp JSON in R2 under `/audio/scene_XXX/`
- [ ] Concurrency cap + retry/backoff for rate limits
- **Acceptance:** a full story's audio track generates with distinct, consistent voices per character; timestamps line up with caption rendering in a manual check.

### Phase 4 — Visual pipeline

- [ ] Character reference sheet: one `gemini-3-pro-image-preview` call per character using the locked identity prompt, stored as the canonical anchor image
- [ ] Key-scene illustration: prompt = scene description + up to 5 present characters' reference images as multimodal input + a fixed style-bible (art style, aspect ratio, lighting) applied uniformly across the whole story
- [ ] Non-key scenes: skip illustration or fall back to `gemini-3.1-flash-image` for budget mode, configurable
- [ ] Re-anchoring: every few scenes, re-attach the *original* reference image (not the most recently generated one) to arrest identity drift
- [ ] Store images (webp, 2K) in R2 under `/images/`
- [ ] Log and surface any generation blocked by safety filters instead of silently dropping it
- **Acceptance:** manual QA across at least 5 generated scenes shows each character visibly recognizable and consistent; total image spend for a test story stays within the configured ceiling.

### Phase 5 — Bundle assembler (`packages/svmp`)

- [ ] `writeBundle(manifest, assets) → zip buffer` and `readBundle(zipBuffer) → ParsedBundle`
- [ ] Writers for `manifest.json`, `characters.json`, `scenes/*.json`, `checksums.json` per the §4 spec
- [ ] Generate `.vtt` captions per scene from ElevenLabs timestamp data
- [ ] Streaming zip assembly (large audio/image payloads — don't buffer everything in memory)
- [ ] `format_version` field from day one, even though there's only one version now
- [ ] Round-trip unit test: write → read produces an identical manifest
- **Acceptance:** a downloaded `.svmp` file re-opens through the reader library with zero additional API calls.

### Phase 6 — Player

- [ ] `/play/[storyId]` (hosted, streams from R2) and a standalone "open local `.svmp` file" mode (drag-and-drop, parsed client-side with JSZip)
- [ ] Scene renderer: image with a subtle Ken-Burns pan synced to scene duration, audio playback, VTT captions overlaid, speaker name tag
- [ ] Controls: play/pause, next/prev scene, scrubber, playback speed
- [ ] Once a bundle is loaded client-side, playback works fully offline
- **Acceptance:** a full story plays start to finish with correct audio/image/caption sync, both via a hosted link and a locally re-uploaded `.svmp` file.

### Phase 7 — Library & job orchestration

- [ ] "My Stories" page: thumbnail, title, status, created date; open in player, download `.svmp`, delete
- [ ] Per-stage progress UI while the pipeline runs (ingest → analyze → cast review *(blocking)* → voice → visuals → assemble)
- [ ] Wire each pipeline phase as a discrete, resumable BullMQ job
- [ ] Minimal auth (single-user is fine for MVP; note explicitly if multi-user is a v2 requirement)
- **Acceptance:** paste a story, review cast, close the tab, come back later to a finished bundle in the library, and replay it with zero regeneration.

### Phase 8 — Cost controls, safety pre-checks, polish

- [ ] Pre-generation cost estimate (word count × per-model cost) shown before the user commits spend
- [ ] Draft/Premium model tier toggle (flash vs pro image models, flash vs v3 voice)
- [ ] Content-safety pre-check pass flagging likely-rejected scenes before spend
- [ ] Per-stage error surfacing with a retry button, not a silent pipeline death
- [ ] Automated tests: schema validation, bundle round-trip, prompt-template rendering

---

## 8. Starter `AGENTS.md`

Drop this in the project root before Phase 0 so every OpenCode session shares the same ground rules:

```markdown
# Project: Storyframe (working name)

Story-to-audio-visual media generator: paste a story, get an illustrated, narrated, redistributable media bundle (.svmp).

## Stack

- Next.js 15 (App Router) + TypeScript, Tailwind
- Postgres via Drizzle ORM (Neon/Supabase)
- Object storage: Cloudflare R2 (S3-compatible)
- Job queue: BullMQ + Upstash Redis
- External APIs: Gemini (analysis: gemini-3.1-pro-preview; images: gemini-3.1-flash-image / gemini-3-pro-image-preview), ElevenLabs (Voice Design v3, TTS eleven_v3 / eleven_flash_v2_5)

## Conventions

- Shared types/schemas live in packages/schemas (Zod), imported by both the web app and the worker — never duplicate a schema.
- Build mode only for anything that calls a paid Gemini/ElevenLabs endpoint, and only after the Phase 2 cast-review approval gate has fired for that story.
- AI-inferred character demographic fields: infer freely from context clues (dialogue, descriptions, names, cultural references, setting). Only leave "unspecified" when there is genuinely zero signal. The one forbidden inference: do NOT assume ethnicity/race solely from a name.
- docs/svmp-format.md is the source of truth for the bundle format. Keep the writer/reader/player in sync with it whenever the schema changes.

## Commands

pnpm dev
pnpm test
pnpm db:migrate

## Do not

- Do not hardcode API keys — read from env, fail loudly if missing.
- Do not skip the cast-review approval gate before triggering paid generation.
- Do not let the analysis prompt infer ethnicity/race from a name alone.
```

---

## 9. Feature suggestions

Roughly ordered by how cheaply they extend the MVP:

- **Casting Director re-roll UX** — the voice preview flow in Phase 3 already returns 3 options per character; surface that as a proper "pick one" UI rather than auto-selecting the first.
- **Content style packs** — one prompt modifier (anime, watercolor, noir comic, photorealistic) applied consistently across the whole story's image prompts, so changing style is a one-click regenerate rather than a rewrite.
- **Change-aware regeneration** — cache generated assets by a content hash of the prompt that produced them; editing one character's bible after generation should only regenerate that character's affected assets, not the whole story.
- **Multi-language dubbing** — ElevenLabs supports 70+ languages; the same images and timing manifest can be reused with a re-narrated audio track, so one `.svmp` could ship with multiple language tracks.
- **Adjustable narration pacing** — expose ElevenLabs' stability/pacing controls as a simple slider in the player, not just at generation time.
- **MP4 "watch mode" export** — burn a bundle down to a shareable video for platforms that don't understand `.svmp`, trading portability-without-regeneration for universal playback.
- **Accessibility pass** — full transcript view, screen-reader mode, and a dyslexia-friendly caption font toggle in the player.
- **Pre-generation safety classifier** — flag likely-explicit or high-risk scenes before spending image/voice budget on them, not just after a rejection.
- **Fan-cast presets (opt-in, later)** — let a user reuse a character's voice_id and reference image across multiple stories featuring the "same" character, useful for crossover/fanfic use cases, gated behind explicit opt-in given the shared-data implications.

---

## 10. Open questions before Phase 0

- **Bundle extension:** `.svmp` is a placeholder — happy with it, or want something else?
- **Budget ceiling:** what's a reasonable per-story generation cost cap? This sets the Draft/Premium default in Phase 8.
- **Multi-language:** in scope for v1, or a clearly-later feature?
- **Hosting:** this plan assumes Vercel + Neon + R2 — confirm or swap.
