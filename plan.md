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

## Phase 1 — Ingestion & analysis engine (COMPLETE 2026-08-20)

Tasks:
- [x] packages/pipeline — sanitize, chunk, prompts, gemini (retries), bible,
      analyzeStory (Gemini -> StoryManifest -> DB + R2 manifest.json), gate, jobs
- [x] packages/pipeline tests (7) — sanitize/chunk/bible/gate units
- [x] worker analysis job + --analyze-story CLI
- [x] Web API: POST /api/stories, GET /api/stories/[id], POST
      /api/stories/[id]/analyze (retry), POST /api/stories/[id]/cast/approve
- [x] Web UI: paste form, story page with polling, cast review screen
- [x] Seed script (worker/src/scripts/seed.ts) + sample fixture story (~10 KB,
      3 chapters, 4 named characters) in packages/pipeline/fixtures
- [x] Typecheck (all packages) + lint (web) + tests clean; route types via next typegen

Acceptance (live Gemini API, model gemini-3.5-flash):
- [x] Real analysis on seeded story "The Lighthouse Keeper's Daughter":
      6 characters (Martha, telegraph boy, Elias, Simon Hale, Merritt, narrator),
      7 scenes, per-scene lines with speaker attribution, story -> cast_review
- [x] manifest.json written to R2 and returned by GET /api/stories/[id]
- [x] UI flow: paste -> POST -> redirect -> poll -> analyzing -> cast review screen
- [x] Failed-analysis path: job fails loudly, story -> analysis_failed, retry re-enqueues
- [x] API accepts 10 KB payload (201)

## Phase 2 — Cast review & approval (COMPLETE 2026-08-20)

Tasks:
- [x] deriveBible: CharacterBible from manifest character; demographics UNSPECIFIED
      unless the text explicitly states them (hard rule, never name-based inference)
- [x] Cast review UI (editable fields, empty = unspecified, no edits required)
- [x] Approve route: merges edits, empty demographic -> UNSPECIFIED, rebuilds
      locked_identity_prompt, version stays 1 on first approval then +1, sets approved_at
- [x] Gate assertCastApproved blocks any paid generation until every character approved

Acceptance (story a31b7fcf + UI story da58e191):
- [x] Gate BLOCKS before approval ("6 character(s) still pending review")
- [x] Partial approval (3/6) still blocks; empty demographic edits normalized to unspecified
- [x] Full approval (6/6): gate PASSES; evidence-based edits merged (e.g. Martha:
      late fifties / woman); locked_identity_prompt built per character
- [x] Full UI flow: review cards -> edit fields -> Approve cast -> success state
- [x] Second story (Glass Fiddle, 5 characters incl. dog Wren) analysed + approved via UI

## Backlog — frontend follow-ups (deferred from Phase 1+2 acceptance)

- [ ] StoryView polls /api/stories/[id] every 3s forever even at terminal states
      (approved) — stop at terminal states or drop to a long interval.
- [ ] No loading timeout — "Loading…" spins forever if the first fetch hangs.
- [ ] No component/UI tests — only schemas/pipeline/storage suites exist.
- [ ] Whitespace-only story text passes HTML required (server 400s later).
- [ ] personality_traits split on "," breaks traits containing commas.
- [ ] No aria-live / aria-busy on polling + saving states.

## Phase 3 — Voice design & narration (BUILDING — gated on cast approval)

Voice integration is now OPTIONAL: no ELEVENLABS_API_KEY → per-story "Skip
narration" → story reaches ready without audio; can re-enable later (2026-08-20).

Tasks:
- [x] packages/pipeline — elevenlabs.ts client (design/create/TTS w/ timestamps,
      retry/backoff on 429/5xx), voices.ts (description generator + narrator
      pseudo-bible + ensureNarratorRow + speakersMissingVoices), narrate.ts
      (per-line TTS orchestration, idempotent per line, R2 audio + timestamps,
      asset rows, status transitions)
- [x] Worker VOICE_TTS job (resumable; story voice_generation -> ready/failed)
- [x] Web API: POST /voice/previews (design 3, gate-checked, re-roll replaces),
      GET /voice/previews/audio (streams from R2), POST /voice/select (save
      voice_id to bible), POST /voice/narrate (enqueue, 409 if running)
- [x] Optional-voice path: ELEVENLABS_API_KEY optional in env; stories.
      voice_skipped column (migration 0001); POST /voice/skip (gate-checked,
      skip -> ready / unskip -> cast_review); GET detail exposes
      voice_enabled + voice_skipped; VoiceDirector shows skip button when
      keyless, "Re-enable narration" from the skipped ready view; worker
      throws loudly if a narrated story has no key
- [x] Casting Director UI: design / play / pick / re-roll per character + narrator;
      narrate trigger; voice_generation/ready/failed status views
- [x] Env: ELEVENLABS_API_KEY optional; ELEVENLABS_VOICE_DESIGN_MODEL +
      ELEVENLABS_TTS_MODEL (optional)
- [x] Live acceptance (skip path): "The Paper Lantern" (17031ef4, cast
      approved) — skip -> ready "narration skipped" -> re-enable -> cast_review
      with Casting Director restored. Full skip/unskip loop verified in browser.
- [x] Paid-call error surfacing: voice routes return JSON { error } instead of
      the dev-server HTML error page (403 from design is shown cleanly in UI)
- [ ] Live acceptance (paid path) — BLOCKED by ElevenLabs plan tier: key works
      (free tier, 10K chars, voice_limit 3) but POST /v1/text-to-voice/design
      returns 403 feature_not_available "Creating a voice through the API is
      only available on a paid plan." Acceptance story ready once plan is paid.

Acceptance (pending key):
- [ ] Full story audio track generates with distinct, consistent voices per
      character; narrator voiced via the same flow.
- [ ] Timestamps stored per line; manual caption sync check.

## Phase 4 — Visual pipeline (Gemini Nano Banana + Pollinations fallback)

Image generation: Gemini image models are a paid feature (free-tier keys get
image-quota limit 0 — verified 2026-08-20), so the visual stage has a free
Pollinations.ai fallback used automatically when Gemini fails, plus a per-story
skip path. Stories reach `ready` without billing.

Tasks:
- [x] packages/pipeline — images.ts: generateImage (Gemini generateContent w/
      responseModalities IMAGE + aspect ratio, 429/5xx retry, safety-block
      errors thrown with reason), pollinationsUrl + generateImagePollinations
      (free GET endpoint, timeout + retry, safe/nologo/seed params, stable
      non-negative seed per char/scene id), generateWithFallback (Gemini ->
      Pollinations on failure; combined error when both fail), fixed
      STYLE_BIBLE, buildPortraitPrompt + buildScenePrompt (pure),
      generateReferencePortraits (idempotent, canonical anchor per character,
      R2 images/characters/*.{jpg|png|webp} keyed by returned mime, url on
      bible), illustrateScenes (idempotent per scene, style bible + up to 5
      present characters, canonical-portrait re-anchor every scene via
      keyFromPublicPath, key vs non-key scene model split), generateStoryVisuals;
      meta.provider (gemini|pollinations) on every asset row
- [x] Worker IMAGE_GENERATION job (portraits -> illustrations; story
      visual_generation -> ready/failed; passes POLLINATIONS_IMAGE_MODEL)
- [x] Web API: POST /visuals/generate (gate: cast approved + voice done or
      skipped; retry from failed; 409 only if visual_generation running),
      POST /visuals/skip (skip -> ready / unskip -> cast_review),
      GET /visuals/asset/[...key] (R2 stream, key-prefix guard,
      extension->content-type), GET detail exposes visual_skipped + scenes[]
      (with image urls)
- [x] UI: VisualDirector (generate / skip / re-enable, mentions Pollinations
      fallback, error surfacing), SceneGallery (illustrated scenes),
      StoryView visual_generation branch, failed branch (Retry + Skip visuals)
- [x] Env: GEMINI_IMAGE_MODEL + POLLINATIONS_IMAGE_MODEL optional (defaults
      nano-banana-pro-preview / flux); .env.example
- [x] Migration 0002: stories.visual_skipped
- [x] Live acceptance (Pollinations fallback path): Paper Lantern (17031ef4)
      — generate -> Gemini 429 -> Pollinations fallback produced real JPEG
      portraits (Mae + Tobias, 3:4) + 2 scene illustrations (1024x576 16:9),
      stored in R2, served via asset route, rendered in SceneGallery
      (imgs complete, naturalWidth 1024). Job -> status ready in ~2.5 min.
      Skip path + retry-from-failed also verified.

Acceptance (pending Gemini billing — paid premium path):
- [ ] Manual QA: >= 5 generated scenes show each character visibly
      recognizable and consistent via Gemini re-anchoring; total image
      spend within ceiling. (Pollinations fallback has no image re-anchoring
      — identity consistency relies on text identity prompts only.)

Blocker + findings (2026-08-20):
- Gemini key probe: gemini-3.1-pro-preview returns 429 (free-tier quota limit 0 —
  no billing on key). gemini-3.5-flash worked once, then "prepayment credits are
  depleted". After the user topped up: flash works, pro still 429s on this plan —
  so GEMINI_ANALYSIS_MODEL=gemini-3.5-flash stays in .env for now (analysis on
  flash; pro model blocked until plan allows it). Re-probe periodically.
- ADC detour reverted (2026-08-20): user confirmed Gemini API key mode only.
  No Vertex vars remain in env schema, .env, docs, or pipeline.
- Next 16 notes: RouteContext literal is the full route path incl. /api prefix;
  next typegen generates it. Dev server 403s LAN-origin chunk requests unless
  allowedDevOrigins is set (added 192.168.0.101 for local acceptance via Playwright).
- PS 5.1 ConvertTo-Json wraps long strings in {value:...} — use node/fetch or curl
  for API smoke tests with large bodies.
- Drizzle gotcha: scene count must use count(scenes.id), not scenes.id aliased
  (fixed in GET /api/stories/[id]; was returning the last scene's UUID).
- gemini-3.5-flash analysis quality: conservative — left all demographic fields
  unspecified even where the text explicitly states them (e.g. "a tall, gaunt
  woman in her late fifties"). Acceptable per hard rules (never guess) but
  under-extracts; re-check when pro is available.

## Phase 5 — Bundle assembler (`packages/svmp`)

A `.svmp` is a ZIP container holding everything the player needs to render a
story offline: manifest, characters, scenes, audio + per-line timestamps,
images, and `.vtt` captions. Once assembled the bundle re-opens via the reader
library with zero additional API calls (acceptance criterion met, see below).

Format spec lives in `docs/svmp-format.md` (source of truth — keep the writer,
reader, and player in sync with it when the schema changes). `format_version`
is `1` from day one.

Tasks:
- [x] packages/svmp — clean new package, deps `yazl` (write) + `yauzl-promise`
      (read) both pure-JS streaming libs (no native deps; honors the spec's
      "don't buffer everything in memory" rule — yazl streams entries
      sequentially, peak per-asset memory ≈ largest asset + zip buffer).
- [x] bundle.ts — `writeBundle(input)` and `readBundle(buf)`. AssetProvider
      interface (`list()` async iter + `get(path)` for binary assets); inline
      JSON entries (manifest, characters, scenes/*, captions/*.vtt) written
      through yazl addBuffer. `BundleManifest` records format_version=1,
      title, engine {gemini_analysis_model, gemini_image_model,
      voice_engine, image_engine}, counts, duration_seconds, voice_skipped,
      visual_skipped, created_at. Sum of audio durations becomes the
      bundle-wide timeline; offsets are applied to VTT cue times.
- [x] checksums.ts — SHA-256 hex per entry, except manifest.json and
      checksums.json themselves (per docs/svmp-format.md — lets counts/duration
      be bumped without invalidating every checksum; checksums.json is not
      self-hashing). `readBundle` recomputes every checksum on load and
      throws `"Checksum mismatch for <path>"` on any drift.
- [x] captions.ts — `parseLineTimestamps` (validates the ElevenLabs
      with-timestamps shape written by narrate.ts), `sceneToVtt(sceneId,
      lines, offset)` (WebVTT header + numbered cues, speaker-id prefixed in
      `[id]` brackets so the player maps to display name via characters.json,
      word-chunks of >=0.4s, bundle-wide offset applied), `formatVttTime`
      (clamp negative, HH:MM:SS.mmm).
- [x] Round-trip unit test — 11 tests (formatVttTime zero/hours/clamp,
      sha256 deterministic, parseLineTimestamps valid+throws, sceneToVtt
      header/cues/offset, write/read identical manifest + characters + scenes,
      checksums exclude manifest/checksums, voice-skipped bundle with no
      audio). All pass.
- [x] packages/pipeline/src/assemble.ts — `assembleBundle(storyId, db, r2,
      opts)` pulls every asset (audio, image, timestamps) from R2 one at a
      time via an AssetProvider over the assets table, rewrites
      `reference_image_url` / `scene.image.url` from streaming API paths to
      bundle-relative paths (so the bundle is fully self-contained), builds
      per-scene VTT with cumulative offset, queries the story manifest for
      counts, returns `{ zip, manifest }`. Exposed via a separate entry point
      `@storyframe/pipeline/assemble` (NOT the main `.` entry) so Next.js
      client components importing `@storyframe/pipeline` don't pull
      yazl/yauzl/`node:crypto` into the browser bundle — they stay
      Node-only.
- [x] Web route — `GET /api/stories/[id]/bundle` (gate: status === ready;
      otherwise 409; 404 if not found). On-demand assembly: no bundle is
      staged in R2. Streams the resulting zip with
      `Content-Type: application/zip`, `Content-Disposition: attachment;
      filename="<slug>.svmp"` (sanitized title), `Cache-Control: no-store`.
- [x] Live acceptance — Paper Lantern (17031ef4): bundle downloaded 184,950
      bytes via the GET /bundle route; `readBundle` re-opened it in 25 ms with
      zero additional API calls; all 7 checksums recomputed and matched;
      format_version=1 enforced; manifest shows voice_skipped=true
      (correct), visual_skipped=false, engine.image_engine="pollinations"
      (Phase 4 fallback lineage preserved in the manifest), 2 characters
      (Mae, Tobias — both with portraits re-anchored to bundle paths),
      2 scenes (scene_001, scene_002 — illustrations re-anchored), 24
      lines counted; no audio or captions present (story had voice skipped
      — captions/ section correctly absent). Bundle is fully self-contained.
- [x] Suite: 51 tests pass (16 schemas + 11 svmp + 2 storage + 22 pipeline),
      typecheck 0 errors, web lint 0 errors.

Findings + gotchas (2026-08-21):
- Next.js client-tree import hazard: any Node-only module (yazl/yauzl/
  node:crypto) transitively reachable from `@storyframe/pipeline`'s main
  entry will break the Turbopack browser bundle with "module not found"
  for `node:crypto` etc. Pipeline package.json `exports` now has two entries:
  `.` (browser-safe: sanitize, chunk, gemini, prompts, bible, analyze,
  jobs, gate, elevenlabs, voices, narrate, images) and `./assemble`
  (Node-only: writes the bundle). The bundle route imports
  `@storyframe/pipeline/assemble`; client components keep importing
  `@storyframe/pipeline`. Do NOT re-export assemble from index.ts.
- PowerShell `Set-Content -Encoding utf8` prepends a UTF-8 BOM that breaks
  JSON parsers (Turbopack was serving `?{` as the first bytes of
  packages/svmp/package.json → 500s). When writing source/JSON via PS,
  strip the BOM afterward, or write via the `write`/`edit` tool instead
  (those don't add BOM). Recovered this session via a Node BOM-strip pass.
- yauzl Entry has no `isDirectory` property (the @types/yauzl d.ts doesn't
  surface one and the base yauzl never sets it for files yazl emits).
  Dropped the guard; entry.isDirectory was always undefined anyway.
- Worker job ASSEMBLE_JOB: intentionally NOT added. The download route
  assembles on demand and streams the result back; no bundle is staged in
  R2. If Phase 7 (library) wants pre-baked bundles for replay/deeplink, add
  the worker job then and cache the .svmp in R2 keyed by story id — but
  for MVP the on-demand path satisfies the Phase 5 acceptance criterion
  ("a downloaded .svmp file re-opens through the reader library with zero
  additional API calls") and avoids doubled storage.
- Cross-package ESM execution: a one-off Node script that imports a
  workspace package must run from inside that package dir (where pnpm
  symlinks `@scope/name` -> `./src/index.ts`), and TS entry points need
  `tsx` (plain `node` refuses `.ts` exports). Use
  `.\packages\<pkg>\node_modules\.bin\tsx.CMD <script.ts> <args>` from
  repo root.

## Phase 6 — Player

Once a `.svmp` is loaded client-side, playback works fully offline — no
further fetches. Two routes hit the same ScenePlayer; only the byte source
differs (server fetch for hosted, FileReader for dropped file).

Tasks:
- [x] apps/web package.json — added `jszip@^3.10.1` (browser-side only;
      no Node deps, weight ~130 KB gz in the bundle).
- [x] lib/parseBundle.ts — `parseBundle(Uint8Array) -> ParsedBundle`.
      Mirrors packages/svmp/readBundle but client-side: jszip.loadAsync ->
      extract every JSON document (manifest.json, characters.json,
      scenes/*.json) + validate through schemas; build Blob URLs for
      binary assets (scene images, per-line audio chunks concatenated per
      scene); parse `captions/*.vtt` into {start, end, speakerId, text}
      cues with a tolerant parser (handles WEBVTT header, optional cue
      ids, [speakerId] tag prefix). `dispose()` revokes all blob URLs —
      caller MUST invoke on unmount (or the URLs leak until tab close).
      Voice-skipped bundles produce empty cue arrays + null audio URLs,
      scenes default to a 6s display duration; duration is otherwise
      probed via a hidden HTML5 audio element's loadedmetadata.
- [x] components/ScenePlayer.tsx — the actual player. Renders the current
      scene's illustration behind a 16:9 stage; CSS transform applied per
      tick (scale 1 -> 1.08, translate subtly) as a Ken-Burns pan synced
      to scene-local progress. Two drivers:
        (1) Voiced: a hidden <audio> element per current scene tracks time;
            onTimeUpdate maps audio.currentTime to bundle-global time via
            scene.startOffset; onEnded advances to the next scene.
        (2) Voice-skipped: requestAnimationFrame advances currentTime by
            (now - lastTick) * playbackRate; auto-advances at scene end.
      Controls: Play/Pause, ← Prev, Next →, a speed menu
      (0.5/1/1.25/1.5/2x) wired to audio.playbackRate or the rAF factor,
      and a scrubber that seeks to a bundle-global time, routes to the
      correct scene and resets its audio source when present.
      Caption overlay: a single bottom-of-stage cling showing the active
      cue (matching currentTime), prefixed with the speaker display name
      from characters.json (Narrator for the `narrator` tag).
- [x] components/BundleLoader.tsx — owns (ParsedBundle, loading, error,
      dispose) lifecycle. Two props: `storyId` (hosted mode, fetches
      /api/stories/[id]/bundle) or `file` (drag-and-drop mode, reads
      via File.arrayBuffer()). Both call parseBundle and render
      ScenePlayer.
- [x] app/play/[storyId]/page.tsx — server component shell rendering
      BundleLoader with storyId. Note the URL convention: /play, not
      /:id/play, so it does NOT collide with /stories/[id] routes and
      the player has a clean dedicated URL namespace.
- [x] app/play/page.tsx — client drag-and-drop page; accepts a File via
      dropped file or file picker, hands it to BundleLoader.
- [x] StoryView ready branch — animated border becomes a row with
      "Play story" (-> /play/[id]), "Download .svmp bundle" (anchor to
      GET /api/stories/[id]/bundle, no fetch in JS needed), and
      "Open local .svmp file" (-> /play).
- [x] Live acceptance — Paper Lantern (17031ef4), 184,951-byte bundle:
      * Hosted /play/[storyId]: server-rendered 200, BundleLoader fetched
        /bundle, parseBundle decoded the zip + 2 character bibles + 2
        scene manifests, illustrations rendered (Scene scene_001), Voice
        being skipped -> totalDuration = 12s (6s/scene fixed). Hit Play:
        scene 1 illustration scales per frame, slider climbs 0 -> 6,
        auto-advances to Scene 2 at the 6s boundary, slider continues
        6 -> 12, Next button disables, timeline reaches end. Controls
        verified: Pause toggles, Prev/Next swap scenes + restart rAF,
        speed menu switches the rate, scrubber seeks to any scene.
      * Drag-and-drop /play: constructed a real File from the same bundle
        bytes (the same File API FileReader yields for a dropped .svmp),
        dispatched change on the <input type=file> — BundleLoader read
        file.arrayBuffer(), parsed, and the ScenePlayer rendered
        identically ("Playing: paper-lantern.svmp", Scene 1/2, 1 image,
        sliderMax=12). Play advanced through Scene 2 identically.
        Offline: after parse no further fetches; image/audio blob URLs
        only.
- [x] Suite: 51 tests still pass (no client tests added — Phase 6 is
      pure interactive UI; the round-trip + readiness gates are covered
      by Phase 5). Typecheck 0 errors, web lint 0 errors.

Findings + gotchas (2026-08-21):
- TS dom lib + Uint8Array<ArrayBufferLike>: new Uint8Array(...) result
  from jszip is typed `Uint8Array<ArrayBufferLike>`, which is NOT
  assignable to BlobPart in this TS install (same bug as Phase 4 audio
  downloads). Fix: `bytes.slice()` returns a fresh Uint8Array<ArrayBuffer>
  that DOM accepts; or map an array of slices. Done in parseBundle.ts
  for both audio (slice-per-line -> BlobPart[]) and image blobs (.slice()).
- next/image can't optimise blob: URLs (no real URL, unknown dims at
  build time). Use a plain <img> with eslint-disable-next-line
  @next/next/no-img-element on the scene illustration line; the optimizer
  saving is irrelevant for in-memory blob URLs.
- Playwright MCP sandbox fs: the file_upload/drop tools run under a
  non-Windows view that cannot stat `C:\` paths even when listed as an
  allowed root. Verified by reaching "File access denied" with
  allowed roots `/tmp/.playwright-mcp, /C:/projects/storylib` — stat
  worked only for certain path forms, never reliably `C:\` forward or
  back. Workaround for acceptance: dispatch `change` on the input
  directly via browser_evaluate, with a File built from the fetched
  bundle bytes — exercises the same code path (FileReader ->
  parseBundle -> ScenePlayer) the drop handler would.
  Phase 7 library can revisit with a Playwright fixture under
  /tmp/.playwright-mcp/ if a real native drop is required.
- Browser bundle import hazard (continuing Phase 5 finding): the
  ScenePlayer / BundleLoader tree imports parseBundle which imports
  `jszip`. JSZip is browser-safe (no `node:` imports, no fs), so it
  bundles cleanly. If parseBundle had pulled in @storyframe/svmp's
  readBundle (which uses `node:crypto` + yauzl-promise) it would have
  killed the client tree — parseBundle is a parallel browser impl, NOT
  a re-export. Keep them split intentionally; do NOT consolidate.

## Phase 2 — Cast review & approval (BUILDING — gated on Phase 1 acceptance)