"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ParsedBundle, ParsedScene } from "@/lib/parseBundle";

// ---------------------------------------------------------------------------
// TTS helpers — deterministic per bundle, scene-aware
// ---------------------------------------------------------------------------

/**
 * Pick a distinct SpeechSynthesisVoice for a speaker.
 * Order is bundle-global (narrator=0, then manifest character order, then
 * first-seen cue order), so the same character always gets the same voice
 * across every scene. Pool is en-* preferred, sorted by voiceURI.
 */
function pickVoiceForSpeaker(
  speakerId: string,
  voices: SpeechSynthesisVoice[],
  order: Map<string, number>
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = enVoices.length > 0 ? enVoices : voices;
  const sorted = [...pool].sort((a, b) => a.voiceURI.localeCompare(b.voiceURI));
  const idx = order.get(speakerId) ?? 0;
  // Round-robin by global order guarantees distinct voices per character
  // until pool wraps; each speaker's voice is stable across scenes.
  return sorted[idx % sorted.length] ?? null;
}

/** Slight pitch variation per speaker so two speakers don't sound identical
 * even when the pool is smaller than the cast. */
function pitchForSpeaker(speakerId: string, order: Map<string, number>): number {
  const idx = order.get(speakerId) ?? 0;
  // Cycle 1.0, 0.92, 1.08, 0.96, 1.04 … stays within 0.8–1.2
  const steps = [1.0, 0.92, 1.08, 0.96, 1.04, 0.88, 1.12];
  return steps[idx % steps.length];
}

interface ScenePlayerProps {
  bundle: ParsedBundle;
}

interface ActiveCue {
  speakerId: string;
  text: string;
  start: number;
  end: number;
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function speakerName(bundle: ParsedBundle, speakerId: string): string {
  if (speakerId === "narrator") return "Narrator";
  const c = bundle.characters.find((x) => x.id === speakerId);
  return c ? c.name : speakerId;
}

export function ScenePlayer({ bundle }: ScenePlayerProps) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const ttsUtterRef = useRef<SpeechSynthesisUtterance | null>(null);
  // TTS timing state: tracks which cue was last spoken and when TTS finished
  const lastSpokenCueRef = useRef<string | null>(null);
  const ttsFinishedAtRef = useRef<number>(0); // performance.now() when last TTS ended
  const TTS_GAP_MS = 1000; // 1s gap between speeches

  const scene: ParsedScene | null = bundle.scenes[sceneIdx] ?? null;
  const totalDuration = bundle.totalDuration;

  // Calculate which beat image to show based on scene progress
  // 3 images per scene: start (0-33%), middle (33-66%), end (66-100%)
  const currentBeatIdx = useMemo(() => {
    if (!scene || scene.imageUrls.length <= 1) return 0;
    const local = currentTime - scene.startOffset;
    const progress = scene.duration > 0 ? Math.min(1, Math.max(0, local / scene.duration)) : 0;
    if (progress < 0.33) return 0;      // start
    if (progress < 0.66) return 1;      // middle
    return 2;                           // end
  }, [currentTime, scene]);

  const activeCue: ActiveCue | null = useMemo(() => {
    if (!scene || scene.cues.length === 0) return null;
    const local = currentTime - scene.startOffset;
    const c = scene.cues.find((c) => local >= c.start && local < c.end);
    return c ? { speakerId: c.speakerId, text: c.text, start: c.start, end: c.end } : null;
  }, [currentTime, scene]);

  // Display cue sticks to the last spoken line during inter-cue gaps and
  // scene transitions so the cue bar never blanks while TTS is still
  // speaking the previous line. TTS itself uses `activeCue` (exact hit).
  const displayCue: ActiveCue | null = useMemo(() => {
    if (activeCue) return activeCue;
    if (!scene || scene.cues.length === 0) return null;
    const local = currentTime - scene.startOffset;
    // In gap: keep previous cue visible until next cue starts.
    let prev: ActiveCue | null = null;
    for (const c of scene.cues) {
      if (c.end <= local) prev = { speakerId: c.speakerId, text: c.text, start: c.start, end: c.end };
      else if (c.start > local) break;
    }
    if (prev) return prev;
    // Before first cue, show first cue if we're close to its start.
    const first = scene.cues[0];
    if (first && first.start - local < 0.8) return null; // keep fallback until cue starts
    return null;
  }, [activeCue, currentTime, scene]);

  // Stable per-speaker index: narrator=0, then bundle characters in
  // manifest order, then any additional cue speakers in first-seen order.
  // Guarantees same character = same voice in every scene, and distinct
  // voices per speaker until the browser pool wraps.
  const speakerOrder = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    const push = (id: string) => {
      if (!seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    };
    push("narrator");
    for (const ch of bundle.characters) push(ch.id);
    for (const s of bundle.scenes) {
      for (const c of s.cues) push(c.speakerId);
      for (const pid of s.manifest.characters_present) push(pid);
    }
    return new Map(order.map((id, i) => [id, i] as const));
  }, [bundle]);

  const needsTts = useMemo(() => {
    if (!scene) return false;
    // Spec trigger: voice_skipped OR this scene has no audio track.
    return (bundle.manifest.voice_skipped || !scene.audioUrl) && scene.cues.length > 0;
  }, [bundle.manifest.voice_skipped, scene]);

  // TTS capability probe + voice list (async: browsers populate voices after onvoiceschanged).
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTtsSupported(true);
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setTtsVoices(voices);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const cancelTts = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    // Mark TTS as finished now so the gap timer starts from this point
    if (ttsUtterRef.current) {
      ttsFinishedAtRef.current = performance.now();
    }
    ttsUtterRef.current = null;
  }, []);

  // Speak the active cue via Web Speech when the bundle (or this scene) has
  // no audio track. Properly syncs with VTT timing:
  //   1. Only speaks when we enter a NEW cue (not the same one)
  //   2. Enforces a 1s gap after TTS finishes before the next cue can speak
  //   3. Adjusts speech rate so the utterance fits within the cue's duration
  useEffect(() => {
    if (!ttsSupported || ttsMuted || !needsTts || !playing || !activeCue) {
      cancelTts();
      return;
    }

    // Build a stable key for this cue (speaker + text)
    const cueKey = `${activeCue.speakerId}::${activeCue.text}`;

    // Don't re-speak the same cue
    if (lastSpokenCueRef.current === cueKey) return;

    // Enforce gap: if TTS just finished, wait at least TTS_GAP_MS
    const now = performance.now();
    const elapsed = now - ttsFinishedAtRef.current;
    if (elapsed < TTS_GAP_MS && lastSpokenCueRef.current !== null) {
      // Too soon — skip this cue and let the clock advance to the next one
      return;
    }

    // Cancel any in-flight utterance
    cancelTts();

    // Calculate how long this cue should take (VTT end - start)
    const cueDuration = activeCue.end - activeCue.start;
    // Estimate natural speech duration for this text (words / ~144 wpm)
    const wordCount = activeCue.text.split(/\s+/).filter(Boolean).length;
    const naturalDuration = wordCount / 2.4 + 0.35; // ~144 wpm + pause
    // Scale rate so speech fits within the cue, clamped to [0.6, 2.0]
    const targetRate = cueDuration > 0.1 ? Math.min(2.0, Math.max(0.6, naturalDuration / cueDuration * rate)) : rate;

    const utter = new SpeechSynthesisUtterance(activeCue.text);
    utter.rate = targetRate;
    utter.pitch = pitchForSpeaker(activeCue.speakerId, speakerOrder);
    const voice = pickVoiceForSpeaker(activeCue.speakerId, ttsVoices, speakerOrder);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }

    // Track when this utterance finishes
    utter.onend = () => {
      ttsFinishedAtRef.current = performance.now();
      lastSpokenCueRef.current = cueKey;
      ttsUtterRef.current = null;
    };
    utter.onerror = () => {
      ttsFinishedAtRef.current = performance.now();
      lastSpokenCueRef.current = cueKey;
      ttsUtterRef.current = null;
    };

    ttsUtterRef.current = utter;
    window.speechSynthesis.speak(utter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCue?.text, activeCue?.speakerId, activeCue?.start, activeCue?.end, playing, needsTts, ttsSupported, ttsMuted, speakerOrder, ttsVoices, rate, cancelTts]);

  // Ensure TTS is cleaned up on unmount / scene navigation / pause.
  useEffect(() => {
    return () => cancelTts();
  }, [cancelTts]);

  useEffect(() => {
    if (!playing) {
      cancelTts();
      // Don't reset lastSpokenCueRef on pause — keep it so we don't re-speak
      // the same cue when resuming. Only reset on scene change or seek.
    }
  }, [playing, cancelTts]);

  useEffect(() => {
    // Scene change cancels any in-flight utterance and resets TTS timing state.
    cancelTts();
    lastSpokenCueRef.current = null;
    ttsFinishedAtRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdx]);

  // 60fps Clock Driver:
  // - When audio is playing, rAF continuously reads audio.currentTime for sub-frame subtitle sync
  // - When voice is skipped / Web Speech TTS is used, rAF drives wall-clock and pauses during utterances
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    if (scene?.audioUrl) {
      const tick = () => {
        const audio = audioRef.current;
        if (audio && !audio.paused && Number.isFinite(audio.currentTime)) {
          const global = scene.startOffset + audio.currentTime;
          setCurrentTime(global);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      };
    }

    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const local = currentTime - scene.startOffset;
      const currentCue = scene.cues.find((c) => local >= c.start && local < c.end);
      const isSpeaking =
        needsTts &&
        !ttsMuted &&
        ttsSupported &&
        typeof window !== "undefined" &&
        window.speechSynthesis.speaking;

      // Pause wall-clock while TTS is actively speaking AND we're inside a cue's time window
      if (isSpeaking && currentCue) {
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setCurrentTime((t) => {
        const next = t + dt * rate;
        if (scene && next >= scene.startOffset + scene.duration) {
          const nextIdx = sceneIdx + 1;
          if (nextIdx >= bundle.scenes.length) {
            setPlaying(false);
            return totalDuration;
          }
          setSceneIdx(nextIdx);
          const nextScene = bundle.scenes[nextIdx];
          return nextScene.startOffset;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, scene, sceneIdx, bundle.scenes.length, bundle.scenes, totalDuration, rate, needsTts, ttsMuted, ttsSupported, currentTime]);

  // Voiced driver: <audio> element controls playback and speed
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !scene?.audioUrl) return;
    audio.playbackRate = rate;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing, rate, scene?.audioUrl]);

  const advanceToScene = useCallback(
    (nextIdx: number, startPlaying = true) => {
      cancelTts();
      lastSpokenCueRef.current = null;
      ttsFinishedAtRef.current = 0;
      if (nextIdx < bundle.scenes.length) {
        setSceneIdx(nextIdx);
        const nextScene = bundle.scenes[nextIdx];
        const nextTime = nextScene.startOffset;
        setCurrentTime(nextTime);
        const audio = audioRef.current;
        if (audio && nextScene.audioUrl) {
          audio.src = nextScene.audioUrl;
          audio.currentTime = 0;
          audio.playbackRate = rate;
          if (startPlaying) {
            audio.play().catch(() => {});
          }
        }
      } else {
        setPlaying(false);
        setCurrentTime(totalDuration);
      }
    },
    [bundle.scenes, totalDuration, rate, cancelTts]
  );

  const onAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !scene) return;
    const global = scene.startOffset + audio.currentTime;
    setCurrentTime(global);
    if (audio.ended) {
      advanceToScene(sceneIdx + 1, playing);
    }
  }, [scene, sceneIdx, advanceToScene, playing]);

  const seek = useCallback(
    (globalTime: number) => {
      cancelTts();
      lastSpokenCueRef.current = null;
      ttsFinishedAtRef.current = 0;
      const target = bundle.scenes.findIndex(
        (s) => globalTime >= s.startOffset && globalTime < s.startOffset + s.duration
      );
      const targetScene = target === -1 ? bundle.scenes[bundle.scenes.length - 1] : bundle.scenes[target];
      const idx = target === -1 ? bundle.scenes.length - 1 : target;
      setSceneIdx(idx);
      setCurrentTime(globalTime);
      const audio = audioRef.current;
      if (audio && targetScene.audioUrl) {
        audio.src = targetScene.audioUrl;
        audio.playbackRate = rate;
        audio.currentTime = Math.max(0, globalTime - targetScene.startOffset);
        if (playing) audio.play().catch(() => setPlaying(false));
      }
    },
    [bundle.scenes, playing, rate, cancelTts]
  );

  const goPrev = useCallback(() => {
    const prevIdx = Math.max(0, sceneIdx - 1);
    advanceToScene(prevIdx, playing);
  }, [sceneIdx, advanceToScene, playing]);

  const goNext = useCallback(() => {
    const nextIdx = Math.min(bundle.scenes.length - 1, sceneIdx + 1);
    advanceToScene(nextIdx, playing);
  }, [bundle.scenes.length, sceneIdx, advanceToScene, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && scene?.audioUrl) {
      audio.playbackRate = rate;
      if (audio.src !== scene.audioUrl) {
        audio.src = scene.audioUrl;
        audio.currentTime = Math.max(0, currentTime - scene.startOffset);
      }
      if (playing && audio.paused) {
        audio.play().catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdx, playing, rate]);

  // Resolve display voice name for the current cue (shown in cue bar).
  const displayVoiceName = useMemo(() => {
    const cue = displayCue ?? activeCue;
    if (!cue || !ttsSupported || ttsVoices.length === 0) return null;
    const v = pickVoiceForSpeaker(cue.speakerId, ttsVoices, speakerOrder);
    return v ? `${v.name} · ${v.lang}` : null;
  }, [displayCue, activeCue, ttsSupported, ttsVoices, speakerOrder]);

  if (!scene) {
    return (
      <div className="rounded-xl border border-border bg-bg-elev p-6 text-sm text-fg-muted shadow-card">
        No scenes to play.
      </div>
    );
  }

  const sceneLocal = currentTime - scene.startOffset;
  const sceneProgress = scene.duration > 0 ? Math.min(1, sceneLocal / scene.duration) : 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Stage — scene image(s) with beat-synced carousel; caption bar below. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl sm:rounded-2xl border border-border bg-black shadow-lift">
        {scene.imageUrls.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.imageUrls[currentBeatIdx] ?? scene.imageUrls[0]}
            alt={`Scene ${scene.manifest.id} — ${currentBeatIdx === 0 ? "start" : currentBeatIdx === 1 ? "middle" : "end"}`}
            className="h-full w-full object-cover"
            style={{
              transform: `scale(${1 + sceneProgress * 0.08}) translate(${sceneProgress * -2}%, ${sceneProgress * -1}%)`,
              transition: "transform 0.1s linear",
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
            <ImageOff className="h-8 w-8" aria-hidden />
            <p className="text-sm">No illustration</p>
          </div>
        )}

        {/* Beat indicator dots — show which of the 3 images is active */}
        {scene.imageUrls.length > 1 && (
          <div className="absolute bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
            {scene.imageUrls.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentBeatIdx
                    ? "w-4 bg-white"
                    : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        )}

        <div className="absolute left-2.5 top-2.5 sm:left-3 sm:top-3 rounded-full bg-black/60 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-medium text-white backdrop-blur-sm">
          Scene {sceneIdx + 1} / {bundle.scenes.length}
        </div>
        <div className="absolute right-2.5 top-2.5 sm:right-3 sm:top-3 max-w-[48%] sm:max-w-xs truncate rounded-full bg-black/60 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs text-white/90 backdrop-blur-sm">
          {scene.manifest.setting}
        </div>
      </div>

      {/* Dedicated cue bar — below the stage so scene badge and dialogue never overlap. */}
      <div className="rounded-xl border border-border bg-bg-elev p-3.5 sm:p-4 shadow-card">
        {displayCue ? (
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
            <span className="self-start shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-primary">
              {speakerName(bundle, displayCue.speakerId)}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm sm:text-base leading-relaxed text-fg break-words font-normal sm:font-medium">{displayCue.text}</p>
              {needsTts && displayVoiceName && (
                <p className="text-[11px] sm:text-xs text-fg-subtle truncate max-w-full">Voice: {displayVoiceName} · pitch {pitchForSpeaker(displayCue.speakerId, speakerOrder).toFixed(2)}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
            <p className="text-xs sm:text-sm text-fg-muted break-words">
              <span className="font-medium text-fg">{scene.manifest.setting}</span>
              <span className="text-fg-subtle"> · {scene.manifest.mood} · {scene.manifest.time_of_day}</span>
            </p>
            <span className="shrink-0 text-[11px] sm:text-xs text-fg-subtle">{scene.cues.length} cue{scene.cues.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={onAudioTimeUpdate}
        onEnded={() => {
          advanceToScene(sceneIdx + 1, playing);
        }}
        hidden={!scene.audioUrl}
        preload="auto"
      />

      <div className="space-y-3 rounded-xl sm:rounded-2xl border border-border bg-bg-elev p-3 sm:p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => {
              if (currentTime >= totalDuration) {
                seek(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 sm:px-5 sm:py-2 text-xs sm:text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={goPrev}
            disabled={sceneIdx === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-xs sm:text-sm text-fg-muted transition hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous scene"
          >
            <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            Prev
          </button>
          <button
            onClick={goNext}
            disabled={sceneIdx >= bundle.scenes.length - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-xs sm:text-sm text-fg-muted transition hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next scene"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
          </button>
          {(() => {
            const hasTtsCues = bundle.scenes.some((s) => s.cues.length > 0 && !s.audioUrl);
            const showTtsToggle = ttsSupported && (bundle.manifest.voice_skipped || hasTtsCues);
            return showTtsToggle ? (
              <button
                onClick={() => {
                  const nextMuted = !ttsMuted;
                  setTtsMuted(nextMuted);
                  if (nextMuted) cancelTts();
                }}
                aria-label={ttsMuted ? "Unmute browser narration" : "Mute browser narration"}
                title={ttsMuted ? "Unmute browser narration" : "Mute browser narration"}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs sm:text-sm transition ${
                  ttsMuted
                    ? "border-border bg-surface text-fg-muted"
                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                }`}
              >
                {ttsMuted ? <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden /> : <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />}
                {ttsMuted ? "Muted" : "Browser voice"}
              </button>
            ) : null;
          })()}
          <div className="relative ml-auto">
            <button
              onClick={() => setSpeedMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-xs sm:text-sm text-fg-muted transition hover:bg-surface hover:text-fg"
              aria-label="Playback speed"
            >
              {rate}x
            </button>
            {speedMenuOpen && (
              <div className="absolute right-0 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-bg-elev p-1 shadow-lift">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setRate(s);
                      setSpeedMenuOpen(false);
                    }}
                    className={`block w-full rounded px-3 py-1 text-left text-xs sm:text-sm transition ${
                      s === rate
                        ? "bg-primary text-primary-fg"
                        : "text-fg-muted hover:bg-surface hover:text-fg"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono text-xs tabular-nums text-fg-muted shrink-0">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 accent-primary h-4 sm:h-5 cursor-pointer touch-none"
          />
          <span className="font-mono text-xs tabular-nums text-fg-muted shrink-0">{formatTime(totalDuration)}</span>
        </div>

        <p className="border-t border-border pt-2.5 sm:pt-3 text-[11px] sm:text-xs text-fg-subtle break-words">
          {bundle.manifest.title}
          {bundle.manifest.voice_skipped
            ? ttsSupported
              ? ttsMuted
                ? " — browser narration muted"
                : " — browser narration (Web Speech) · voices distinct per character"
              : " — narration skipped (browser TTS unavailable)"
            : !scene?.audioUrl && scene?.cues.length
              ? ttsSupported
                ? ttsMuted
                  ? " — browser narration muted for this scene"
                  : " — browser narration for this scene"
                : ""
              : ""}
  </p>
   </div>
 </div>
  );
}
