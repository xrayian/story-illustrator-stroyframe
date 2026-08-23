# `.svmp` Bundle Format — Source of Truth

A `.svmp` file is a standard **ZIP** archive that contains everything needed
to play a story offline: the manifest, the cast, every scene's text + image,
the narration audio with per-line alignment, and captions. Once assembled, the
player needs **zero additional API calls** to render it.

`format_version` (an integer in the bundle manifest) lets the player evolve
the schema later without breaking old bundles. The current version is **1**.

## Bundle layout

```
mystory.svmp
├── manifest.json              # BundleManifest (format_version, title, engine, counts, duration)
├── characters.json             # CharacterBible[] (post cast review, voices + portraits embedded as references)
├── scenes/
│   ├── scene_001.json          # SceneManifest (setting, mood, characters_present, image ref, line_refs)
│   └── scene_002.json
├── audio/                      # omitted entirely when voice_skipped = true
│   └── scene_001/
│       ├── line_0001.mp3
│       ├── line_0001.timestamps.json
│       └── ...
├── images/                     # omitted entirely when visual_skipped = true
│   ├── characters/
│   │   └── char_1.jpg          # canonical reference portrait (mime chooses extension)
│   └── scene_001/
│       └── illustration.jpg    # scene illustration
├── captions/                   # always present — synthetic when voice_skipped (see below)
│   └── scene_001.vtt
└── checksums.json              # { "path": "sha256-hex", ... } for every other entry
```

## `manifest.json` — `BundleManifest`

```jsonc
{
  "format_version": 1,
  "title": "The Paper Lantern",
  "engine": {
    "gemini_analysis_model": "gemini-3.5-flash",
    "gemini_image_model": "nano-banana-pro-preview",
    "voice_engine": "elevenlabs",
    "image_engine": "pollinations"          // "gemini" | "pollinations" | null (visual_skipped)
  },
  "counts": { "characters": 2, "scenes": 2, "lines": 7 },
  "duration_seconds": 18.4,                  // sum of audio (or synthetic) durations; ~estimated when voice_skipped
  "voice_skipped": false,
  "visual_skipped": false,
  "created_at": "2026-08-20T19:00:00.000Z"
}
```

## `characters.json`

A JSON array of `CharacterBible` objects (see `packages/schemas/src/character-bible.ts`).
The `voice_id` and `reference_image_url` fields are present when the respective
stage was not skipped. `reference_image_url` inside the bundle is a **bundle
path** (e.g. `"images/characters/char_1.jpg"`), not the streaming API URL.

## `scenes/scene_XXX.json`

A `SceneManifest` object (see `packages/schemas/src/scene-manifest.ts`).
`scene.image` is `{ key, url }` where `url` is the **bundle path**
(e.g. `"images/scene_001/illustration.jpg"`); absent when the scene was not
illustrated. `line_refs` lists the `StoryLine.id`s in this scene, in order.

## `audio/scene_XXX/line_XXXX.[mp3|timestamps.json]`

One audio file per narration line, paired with a `*.timestamps.json` written
from the ElevenLabs `with-timestamps` response:

```jsonc
{
  "lineId": "line_0001",
  "speakerId": "narrator",
  "text": "On the last night of the festival...",
  "characters": [...],     // ElevenLabs alignment characters
  "startTimes": [0.0, 0.12, ...],
  "endTimes":   [0.11, 0.25, ...]
}
```

## `captions/scene_XXX.vtt`

A WebVTT file per scene, generated from the audio timestamps when narration
exists. Each cue spans one aligned word/segment of a line, prefixed with the
speaker name:

```
WEBVTT

00:00:00.000 --> 00:00:00.510
[narrator] On the last night ...

00:00:00.510 --> 00:00:01.240
[narrator] of the festival...
```

When `voice_skipped` is true there are no audio timestamps in R2 — the
assembler synthesizes captions from the script (`StoryManifest.scenes[].lines`)
instead, using `syntheticSceneToVtt` (`svmp/captions.ts`) with durations
estimated from text length (`estimateLineDuration`). One cue per line, with a
0.2 s inter-line gap. The resulting bundle has a non-zero
`manifest.duration_seconds` (used by the wall-clock driver) and the browser
player's Web Speech fallback (`window.speechSynthesis`) speaks each cue aloud,
picking a distinct `SpeechSynthesisVoice` per speaker by hash + per-character
order offset, at the playback `rate`. No `.svmp` format version bump is needed —
captions are simply now present for voice-skipped bundles where the old spec
said they were omitted.

Legacy voice-skipped bundles with no `captions/` entries still load — the
player falls back to silent auto-advance when cues are absent.

## `checksums.json`

```jsonc
{
  "characters.json": "9f2c...",
  "scenes/scene_001.json": "a18b...",
  "audio/scene_001/line_0001.mp3": "ff...",
  "images/characters/char_1.jpg": "71...",
  "captions/scene_001.vtt": "3d..."
}
```

SHA-256 hex digests of every entry **except `manifest.json` and `checksums.json`
themselves**. The reader recomputes these on load to verify bundle integrity.
`manifest.json` is excluded so content fixes can bump counts/duration without
invalidating every checksum; `checksums.json` is self-evidently not self-hashing.

## Reader contract

`readBundle(zipBuffer)` validates `format_version`, recomputes checksums, and
returns a `ParsedBundle` with the decoded JSON documents plus a map of raw
bytes for binary assets keyed by bundle path. No network calls are made.
