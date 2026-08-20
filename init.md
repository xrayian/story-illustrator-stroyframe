\# Story-to-Audio-Visual Media Engine — Build Plan



\*\*Working name:\*\* Storyframe \*(rename freely — search/replace in AGENTS.md once you pick one)\*

\*\*Format name:\*\* `.svmp` — Story Visual Media Package

\*\*Target:\*\* Next.js web app, shareable-link playback, custom portable bundle format

\*\*Scope:\*\* MVP pipeline + a basic library to store and replay past generations



This document is written to be dropped straight into an OpenCode project and worked

phase-by-phase: run \*\*Plan mode\*\* on a phase to sanity-check the approach against your

actual repo, then \*\*Build mode\*\* to execute it. Each phase has its own acceptance

criteria so you know when to move on.



\---



\## 1. What it does, end to end



1\. You paste raw story text (Wattpad, Facebook, wherever) into a form.

2\. Gemini reads the whole thing and produces a structured breakdown: every character,

&#x20;  every scene, who's speaking in every line, and which scenes are visually worth

&#x20;  illustrating.

3\. You review and edit the cast list before anything paid happens — this is the one

&#x20;  mandatory human checkpoint in the pipeline.

4\. ElevenLabs designs a distinct voice for every character (and the narrator) from a

&#x20;  text description, then narrates every line.

5\. Nano Banana generates a locked reference portrait for each character, then

&#x20;  illustrates key scenes, reusing those reference images so everyone stays visually

&#x20;  consistent from scene to scene.

6\. Everything gets packaged into a single `.svmp` file — text, timed audio, images,

&#x20;  captions, and a manifest — that a lightweight player can open and replay forever

&#x20;  without touching the network or spending another cent.

7\. Finished bundles live in a personal library you can reopen, download, or share a

&#x20;  link to.



\---



\## 2. Architecture



```

Next.js app (App Router, TypeScript)

├── apps/web            → UI: paste form, cast review, library, player

├── packages/pipeline    → orchestration: analysis → voice → visual → assembly

├── packages/schemas     → shared Zod schemas (StoryManifest, CharacterBible, SceneManifest)

├── packages/svmp        → .svmp writer/reader (used by both pipeline and player)

└── worker                → BullMQ jobs, one per pipeline stage, resumable

```



\- \*\*Web/UI + API routes:\*\* Next.js 15, TypeScript, Tailwind

\- \*\*Database:\*\* Postgres (Neon or Supabase) via Drizzle ORM — stores stories, jobs,

&#x20; character bibles, scene metadata

\- \*\*Object storage:\*\* Cloudflare R2 (S3-compatible) — stores generated audio, images,

&#x20; and finished `.svmp` files

\- \*\*Job queue:\*\* BullMQ + Upstash Redis — the pipeline is slow (many external API

&#x20; calls), so it runs as background jobs the UI polls, not a blocking request

\- \*\*External APIs:\*\* Gemini API (analysis + image generation), ElevenLabs API (voice

&#x20; design + narration)



This matches your existing Next.js / Node stack, so the web layer and the worker can

share the same TypeScript schemas package without a language boundary.



\---



\## 3. External API notes (accurate as of this plan's writing — verify against docs

&#x20;  before locking in, these move fast)



\*\*Gemini — text analysis\*\*

\- Use `gemini-3.1-pro-preview` for the main analysis pass (character/scene/speaker

&#x20; extraction needs its stronger reasoning for pronoun and coreference resolution

&#x20; across a long story). Use a cheaper `gemini-3.5-flash` pass for lighter downstream

&#x20; tasks like caption cleanup.

\- Force structured output with `response\_format: { type: "text", mime\_type:

&#x20; "application/json", schema: <your Zod-derived JSON schema> }`. This constrains

&#x20; generation token-by-token so you get valid JSON matching your schema, not a

&#x20; best-effort string to parse.



\*\*Gemini — image generation ("Nano Banana")\*\*

\- Three tiers exist: `gemini-3.1-flash-image` (Nano Banana 2 — fast, \~$0.02–0.04/image,

&#x20; good default for most scenes), `gemini-3-pro-image-preview` (Nano Banana Pro —

&#x20; higher fidelity, \~$0.134 at 2K, best identity-locking across a cast), and the legacy

&#x20; `gemini-2.5-flash-image`.

\- Both current models can hold up to \*\*5 characters' identities and 14 reference

&#x20; objects/images consistent\*\* across a generation. Use this directly: pass each

&#x20; present character's locked reference portrait as an input image alongside the scene

&#x20; prompt, every time.

\- Images carry an invisible SynthID watermark by default — no action needed, it's

&#x20; automatic and not something to strip.



\*\*ElevenLabs — voice design + narration\*\*

\- Voice Design (`POST /v1/text-to-voice/design`, model `eleven\_ttv\_v3`) takes a

&#x20; 20–1000 character natural-language description — age, gender, accent, tone, pacing

&#x20; — and returns 3 distinct voice previews. `POST /v1/text-to-voice/create` saves the

&#x20; chosen preview as a permanent `voice\_id` in your library.

\- For narration, `eleven\_v3` gives the widest emotional/expressive range; use

&#x20; `eleven\_flash\_v2\_5` for cheap draft passes during development (\~75ms latency,

&#x20; noticeably lower quality).

\- Request character-level timestamps on TTS calls — this is what lets you sync

&#x20; captions and Ken-Burns image pans to the actual spoken audio instead of guessing.

\- ElevenLabs also supports multi-speaker dialogue generation natively if you want to

&#x20; explore rendering a whole scene's dialogue in one call later, rather than

&#x20; line-by-line.



\---



\## 4. Data model



\### `StoryManifest` (output of the analysis stage)

```ts

{

&#x20; title: string

&#x20; characters: { id, name, aliases\[], role }\[]

&#x20; scenes: {

&#x20;   id, order, setting, time\_of\_day, mood,

&#x20;   is\_key\_scene: boolean,          // drives illustration budget

&#x20;   characters\_present: string\[],   // character ids

&#x20;   lines: { id, speaker\_id | "narrator", text, emotion\_tag? }\[]

&#x20; }\[]

}

```



\### `CharacterBible` (built from StoryManifest, user-editable before locking)

```ts

{

&#x20; id, name, role,

&#x20; apparent\_age\_range: string | "unspecified",

&#x20; gender\_expression: string | "unspecified",

&#x20; ethnicity\_or\_culture\_cues: string | "unspecified",  // only if explicit in text

&#x20; physical\_description: string,

&#x20; personality\_traits: string\[],

&#x20; voice\_id: string | null,          // ElevenLabs, set after Phase 3

&#x20; reference\_image\_url: string | null, // set after Phase 4

&#x20; locked\_identity\_prompt: string,   // used for both voice design and image gen

&#x20; version: number

}

```



\### `.svmp` bundle (zip container)

```

mystory.svmp

├── manifest.json         # format\_version, title, engine versions, duration, counts

├── characters.json        # CharacterBible\[]

├── scenes/

│   ├── scene\_001.json     # setting, mood, characters\_present, image ref, line refs

│   └── ...

├── audio/

│   └── scene\_001/

│       ├── line\_0001.mp3

│       └── line\_0001.timestamps.json

├── images/

│   ├── characters/char\_<id>\_ref.webp

│   └── scenes/scene\_001.webp

├── captions/scene\_001.vtt

└── checksums.json

```

`format\_version` in the manifest is what lets the player handle future schema changes

without breaking old bundles.



\---



\## 5. Bias, safety, and consent — design principles, not an afterthought



You specifically flagged race/age/gender awareness, so bake these in as hard rules,

not UI copy:



\- \*\*Evidence-based only.\*\* The analysis prompt must extract demographic attributes

&#x20; \*only\* when the text explicitly states or clearly implies them (a stated

&#x20; nationality, an explicit age, a described feature). Never let the model infer race

&#x20; or ethnicity from a character's name sounding a certain way — that's exactly the

&#x20; stereotyping pattern to avoid. Unknown fields are stored as `"unspecified"`, not

&#x20; guessed.

\- \*\*Human-in-the-loop before spend.\*\* The cast review gate (Phase 2) is the one

&#x20; mandatory stop in the pipeline. No voice design call and no image generation call

&#x20; fires until the user has seen and can edit every character's inferred attributes.

&#x20; This is also just good cost control.

\- \*\*User-filled, not auto-filled.\*\* If a field is unspecified, the review UI shows an

&#x20; empty field with a placeholder, not a pre-filled guess the user has to notice and

&#x20; overturn.

\- \*\*Copyright reminder, not a copyright opinion.\*\* Pasted text is user-supplied and

&#x20; may be someone else's copyrighted fiction (fanfic, published excerpts, etc.). Add a

&#x20; one-time notice at the input step reminding the user that redistributing the

&#x20; finished bundle is on them to have rights for — a checkbox, not a legal essay.

\- \*\*Content safety.\*\* Rely on Gemini's and ElevenLabs' built-in safety filters as the

&#x20; backstop, but add a pre-check pass in Phase 8 that flags scenes likely to be

&#x20; rejected (explicit content, hate-themed material) before you spend generation

&#x20; budget on them.



\---



\## 6. Feature-flagged risk: cost



Nano Banana Pro at $0.134/image and ElevenLabs' character-metered TTS both add up

fast on a full-length story. Phase 8 builds a pre-generation cost estimate and a

Draft/Premium model tier toggle — treat that as required for MVP, not a nice-to-have,

or your first long story will surprise you.



\---



\## 7. Phased task plan



Each phase lists concrete tasks as checkboxes and an acceptance test. Work through

Plan mode first on each phase before flipping to Build mode.



\### Phase 0 — Scaffold

\- \[ ] Init Next.js 15 (App Router, TS) with the monorepo layout in §2

\- \[ ] `packages/schemas`: Zod schemas for `StoryManifest`, `CharacterBible`,

&#x20;     `SceneManifest`, generate JSON Schema from them for Gemini's `response\_format`

\- \[ ] Postgres via Drizzle: tables `stories`, `jobs`, `characters`, `scenes`, `assets`

\- \[ ] R2 bucket wired up with a typed upload/download helper

\- \[ ] BullMQ + Upstash Redis queue scaffold with one no-op test job

\- \[ ] Env var validation at boot: `GEMINI\_API\_KEY`, `ELEVENLABS\_API\_KEY`,

&#x20;     `DATABASE\_URL`, `R2\_\*`

\- \*\*Acceptance:\*\* `pnpm dev` boots, a migration runs clean, a test script can create

&#x20; and read back a `stories` row, the no-op job completes end to end.



\### Phase 1 — Ingestion \& analysis engine

\- \[ ] "Paste story" UI: textarea, optional title/source-URL, a rights-reminder

&#x20;     checkbox per §5

\- \[ ] Text sanitizer: strip HTML/markdown cruft, repeated chapter boilerplate, ad

&#x20;     artifacts common to Wattpad/Facebook copy-paste; normalize whitespace; detect

&#x20;     language

\- \[ ] Chunking strategy for long stories: first pass on explicit chapter/scene

&#x20;     break markers, fallback to a Gemini boundary-detection pass for unbroken text

\- \[ ] Analysis prompt (system instruction) enforcing: evidence-only character

&#x20;     attributes, scene segmentation, per-line speaker attribution, `is\_key\_scene`

&#x20;     flagging for illustration priority

\- \[ ] Call Gemini (`gemini-3.1-pro-preview`) with the `StoryManifest` JSON schema;

&#x20;     handle schema-validation retries

\- \[ ] Persist `StoryManifest` to Postgres + R2

\- \*\*Acceptance:\*\* a \~5,000-word test story returns a valid `StoryManifest` with

&#x20; correctly segmented scenes and speaker-attributed lines — spot-check on 3 varied

&#x20; sample stories (different genres/formats) before moving on.



\### Phase 2 — Character bible + review UI

\- \[ ] Derive `CharacterBible` entries from `StoryManifest.characters`, resolving

&#x20;     aliases/coreference into one entry per person

\- \[ ] Cast Review screen: editable fields per character, unspecified fields shown

&#x20;     empty (never pre-filled with a guess)

\- \[ ] "Approve cast" action generates the `locked\_identity\_prompt` per character and

&#x20;     freezes that version

\- \[ ] Version the bible (`version` field) so later edits don't destroy history or

&#x20;     force a full regeneration

\- \*\*Acceptance:\*\* no Gemini image call or ElevenLabs call can fire until a cast has

&#x20; been explicitly approved through this screen.



\### Phase 3 — Voice pipeline

\- \[ ] Voice-description prompt generator from `CharacterBible` (age/gender/accent/

&#x20;     tone/pacing sentence, 20–1000 chars)

\- \[ ] `POST /v1/text-to-voice/design` (`eleven\_ttv\_v3`) → 3 previews per character

\- \[ ] Casting Director UI: play previews, pick one (or "re-roll" for 3 new ones)

\- \[ ] `POST /v1/text-to-voice/create` to save the chosen preview; store `voice\_id`

&#x20;     on the `CharacterBible`

\- \[ ] Narrator gets the same flow as a pseudo-character

\- \[ ] Line-by-line TTS (`eleven\_v3` for narration quality, `eleven\_flash\_v2\_5` for

&#x20;     draft/preview mode) with character-level timestamps requested

\- \[ ] Store audio + timestamp JSON in R2 under `/audio/scene\_XXX/`

\- \[ ] Concurrency cap + retry/backoff for rate limits

\- \*\*Acceptance:\*\* a full story's audio track generates with distinct, consistent

&#x20; voices per character; timestamps line up with caption rendering in a manual check.



\### Phase 4 — Visual pipeline

\- \[ ] Character reference sheet: one `gemini-3-pro-image-preview` call per character

&#x20;     using the locked identity prompt, stored as the canonical anchor image

\- \[ ] Key-scene illustration: prompt = scene description + up to 5 present

&#x20;     characters' reference images as multimodal input + a fixed style-bible (art

&#x20;     style, aspect ratio, lighting) applied uniformly across the whole story

\- \[ ] Non-key scenes: skip illustration or fall back to `gemini-3.1-flash-image` for

&#x20;     budget mode, configurable

\- \[ ] Re-anchoring: every few scenes, re-attach the \*original\* reference image (not

&#x20;     the most recently generated one) to arrest identity drift

\- \[ ] Store images (webp, 2K) in R2 under `/images/`

\- \[ ] Log and surface any generation blocked by safety filters instead of silently

&#x20;     dropping it

\- \*\*Acceptance:\*\* manual QA across at least 5 generated scenes shows each character

&#x20; visibly recognizable and consistent; total image spend for a test story stays

&#x20; within the configured ceiling.



\### Phase 5 — Bundle assembler (`packages/svmp`)

\- \[ ] `writeBundle(manifest, assets) → zip buffer` and `readBundle(zipBuffer) →

&#x20;     ParsedBundle`

\- \[ ] Writers for `manifest.json`, `characters.json`, `scenes/\*.json`,

&#x20;     `checksums.json` per the §4 spec

\- \[ ] Generate `.vtt` captions per scene from ElevenLabs timestamp data

\- \[ ] Streaming zip assembly (large audio/image payloads — don't buffer everything

&#x20;     in memory)

\- \[ ] `format\_version` field from day one, even though there's only one version now

\- \[ ] Round-trip unit test: write → read produces an identical manifest

\- \*\*Acceptance:\*\* a downloaded `.svmp` file re-opens through the reader library with

&#x20; zero additional API calls.



\### Phase 6 — Player

\- \[ ] `/play/\[storyId]` (hosted, streams from R2) and a standalone "open local

&#x20;     `.svmp` file" mode (drag-and-drop, parsed client-side with JSZip)

\- \[ ] Scene renderer: image with a subtle Ken-Burns pan synced to scene duration,

&#x20;     audio playback, VTT captions overlaid, speaker name tag

\- \[ ] Controls: play/pause, next/prev scene, scrubber, playback speed

\- \[ ] Once a bundle is loaded client-side, playback works fully offline

\- \*\*Acceptance:\*\* a full story plays start to finish with correct audio/image/caption

&#x20; sync, both via a hosted link and a locally re-uploaded `.svmp` file.



\### Phase 7 — Library \& job orchestration

\- \[ ] "My Stories" page: thumbnail, title, status, created date; open in player,

&#x20;     download `.svmp`, delete

\- \[ ] Per-stage progress UI while the pipeline runs (ingest → analyze → cast review

&#x20;     \*(blocking)\* → voice → visuals → assemble)

\- \[ ] Wire each pipeline phase as a discrete, resumable BullMQ job

\- \[ ] Minimal auth (single-user is fine for MVP; note explicitly if multi-user is a

&#x20;     v2 requirement)

\- \*\*Acceptance:\*\* paste a story, review cast, close the tab, come back later to a

&#x20; finished bundle in the library, and replay it with zero regeneration.



\### Phase 8 — Cost controls, safety pre-checks, polish

\- \[ ] Pre-generation cost estimate (word count × per-model cost) shown before the

&#x20;     user commits spend

\- \[ ] Draft/Premium model tier toggle (flash vs pro image models, flash vs v3 voice)

\- \[ ] Content-safety pre-check pass flagging likely-rejected scenes before spend

\- \[ ] Per-stage error surfacing with a retry button, not a silent pipeline death

\- \[ ] Automated tests: schema validation, bundle round-trip, prompt-template

&#x20;     rendering



\---



\## 8. Starter `AGENTS.md`



Drop this in the project root before Phase 0 so every OpenCode session shares the

same ground rules:



```markdown

\# Project: Storyframe (working name)

Story-to-audio-visual media generator: paste a story, get an illustrated, narrated,

redistributable media bundle (.svmp).



\## Stack

\- Next.js 15 (App Router) + TypeScript, Tailwind

\- Postgres via Drizzle ORM (Neon/Supabase)

\- Object storage: Cloudflare R2 (S3-compatible)

\- Job queue: BullMQ + Upstash Redis

\- External APIs: Gemini (analysis: gemini-3.1-pro-preview; images:

&#x20; gemini-3.1-flash-image / gemini-3-pro-image-preview), ElevenLabs (Voice Design v3,

&#x20; TTS eleven\_v3 / eleven\_flash\_v2\_5)



\## Conventions

\- Shared types/schemas live in packages/schemas (Zod), imported by both the web app

&#x20; and the worker — never duplicate a schema.

\- Build mode only for anything that calls a paid Gemini/ElevenLabs endpoint, and only

&#x20; after the Phase 2 cast-review approval gate has fired for that story.

\- AI-inferred character demographic fields must trace to explicit text evidence.

&#x20; Leave a field "unspecified" rather than guess — this is a hard rule, not a style

&#x20; preference.

\- docs/svmp-format.md is the source of truth for the bundle format. Keep the

&#x20; writer/reader/player in sync with it whenever the schema changes.



\## Commands

pnpm dev

pnpm test

pnpm db:migrate



\## Do not

\- Do not hardcode API keys — read from env, fail loudly if missing.

\- Do not skip the cast-review approval gate before triggering paid generation.

\- Do not let the analysis prompt infer ethnicity/race from a name alone.

```



\---



\## 9. Feature suggestions



Roughly ordered by how cheaply they extend the MVP:



\- \*\*Casting Director re-roll UX\*\* — the voice preview flow in Phase 3 already returns

&#x20; 3 options per character; surface that as a proper "pick one" UI rather than

&#x20; auto-selecting the first.

\- \*\*Content style packs\*\* — one prompt modifier (anime, watercolor, noir comic,

&#x20; photorealistic) applied consistently across the whole story's image prompts, so

&#x20; changing style is a one-click regenerate rather than a rewrite.

\- \*\*Change-aware regeneration\*\* — cache generated assets by a content hash of the

&#x20; prompt that produced them; editing one character's bible after generation should

&#x20; only regenerate that character's affected assets, not the whole story.

\- \*\*Multi-language dubbing\*\* — ElevenLabs supports 70+ languages; the same images and

&#x20; timing manifest can be reused with a re-narrated audio track, so one `.svmp` could

&#x20; ship with multiple language tracks.

\- \*\*Adjustable narration pacing\*\* — expose ElevenLabs' stability/pacing controls as a

&#x20; simple slider in the player, not just at generation time.

\- \*\*MP4 "watch mode" export\*\* — burn a bundle down to a shareable video for platforms

&#x20; that don't understand `.svmp`, trading portability-without-regeneration for

&#x20; universal playback.

\- \*\*Accessibility pass\*\* — full transcript view, screen-reader mode, and a

&#x20; dyslexia-friendly caption font toggle in the player.

\- \*\*Pre-generation safety classifier\*\* — flag likely-explicit or high-risk scenes

&#x20; before spending image/voice budget on them, not just after a rejection.

\- \*\*Fan-cast presets (opt-in, later)\*\* — let a user reuse a character's voice\_id and

&#x20; reference image across multiple stories featuring the "same" character, useful for

&#x20; crossover/fanfic use cases, gated behind explicit opt-in given the shared-data

&#x20; implications.



\---



\## 10. Open questions before Phase 0



\- \*\*Bundle extension:\*\* `.svmp` is a placeholder — happy with it, or want something

&#x20; else?

\- \*\*Budget ceiling:\*\* what's a reasonable per-story generation cost cap? This sets

&#x20; the Draft/Premium default in Phase 8.

\- \*\*Multi-language:\*\* in scope for v1, or a clearly-later feature?

\- \*\*Hosting:\*\* this plan assumes Vercel + Neon + R2 — confirm or swap.

