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

  const scene: ParsedScene | null = bundle.scenes[sceneIdx] ?? null;
  const totalDuration = bundle.totalDuration;

  const activeCue: ActiveCue | null = useMemo(() => {
    if (!scene || scene.cues.length === 0) return null;
    const local = currentTime - scene.startOffset;
    return scene.cues.find((c) => local >= c.start && local < c.end) ?? null;
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
      if (c.end <= local) prev = c;
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
    ttsUtterRef.current = null;
  }, []);

  // Speak the active cue via Web Speech when the bundle (or this scene) has
  // no audio track. Cancel previous utterance on cue/playing/scene change.
  useEffect(() => {
    if (!ttsSupported || ttsMuted || !needsTts || !playing || !activeCue) {
      cancelTts();
      return;
    }
    cancelTts();
    const utter = new SpeechSynthesisUtterance(activeCue.text);
    utter.rate = rate;
    utter.pitch = pitchForSpeaker(activeCue.speakerId, speakerOrder);
    const voice = pickVoiceForSpeaker(activeCue.speakerId, ttsVoices, speakerOrder);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    ttsUtterRef.current = utter;
    window.speechSynthesis.speak(utter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCue?.text, activeCue?.speakerId, playing, needsTts, ttsSupported, ttsMuted, speakerOrder, ttsVoices, rate, cancelTts]);

  // Ensure TTS is cleaned up on unmount / scene navigation / pause.
  useEffect(() => {
    return () => cancelTts();
  }, [cancelTts]);

  useEffect(() => {
    if (!playing) cancelTts();
  }, [playing, cancelTts]);

  useEffect(() => {
    // Scene change cancels any in-flight utterance.
    cancelTts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdx]);

  // Voice-skipped driver: wall-clock rAF advances currentTime when no audio.
  // When browser TTS is speaking the current cue, we pause wall-clock so the
  // utterance isn't cut off halfway by an early scene transition. Muted or
  // non-TTS scenes advance on the fixed synthetic TTL.
  useEffect(() => {
    if (!playing || scene?.audioUrl) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      if (
        needsTts &&
        !ttsMuted &&
        ttsSupported &&
        typeof window !== "undefined" &&
        window.speechSynthesis.speaking
      ) {
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
          return bundle.scenes[nextIdx].startOffset;
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
  }, [playing, scene, sceneIdx, bundle.scenes.length, bundle.scenes, totalDuration, rate, needsTts, ttsMuted, ttsSupported]);

  // Voiced driver: <audio> element drives currentTime for the current scene.
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

  const onAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !scene) return;
    const local = audio.currentTime;
    const global = scene.startOffset + local * (audio.playbackRate || 1);
    setCurrentTime(global);
    if (audio.ended) {
      const nextIdx = sceneIdx + 1;
      if (nextIdx < bundle.scenes.length) {
        setSceneIdx(nextIdx);
        const next = bundle.scenes[nextIdx];
        if (next.audioUrl && audioRef.current) {
          audioRef.current.src = next.audioUrl;
          audioRef.current.currentTime = 0;
          if (playing) audioRef.current.play().catch(() => setPlaying(false));
        }
      } else {
        setPlaying(false);
        setCurrentTime(totalDuration);
      }
    }
  }, [scene, sceneIdx, bundle.scenes, totalDuration, playing]);

  const seek = useCallback(
    (globalTime: number) => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      const target = bundle.scenes.findIndex(
        (s) => globalTime >= s.startOffset && globalTime < s.startOffset + s.duration
      );
      const scene = target === -1 ? bundle.scenes[bundle.scenes.length - 1] : bundle.scenes[target];
      const idx = target === -1 ? bundle.scenes.length - 1 : target;
      setSceneIdx(idx);
      setCurrentTime(globalTime);
      const audio = audioRef.current;
      if (audio && scene.audioUrl) {
        audio.src = scene.audioUrl;
        audio.currentTime = Math.max(0, globalTime - scene.startOffset);
        if (playing) audio.play().catch(() => setPlaying(false));
      }
    },
    [bundle.scenes, playing]
  );

  const goPrev = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSceneIdx((i) => Math.max(0, i - 1));
    const s = bundle.scenes[Math.max(0, sceneIdx - 1)];
    setCurrentTime(s?.startOffset ?? 0);
  }, [bundle.scenes, sceneIdx]);

  const goNext = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const nextIdx = Math.min(bundle.scenes.length - 1, sceneIdx + 1);
    setSceneIdx(nextIdx);
    setCurrentTime(bundle.scenes[nextIdx]?.startOffset ?? 0);
  }, [bundle.scenes, sceneIdx]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && scene?.audioUrl) {
      audio.src = scene.audioUrl;
      audio.currentTime = Math.max(0, currentTime - scene.startOffset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdx]);

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
    <div className="space-y-4">
      {/* Stage — scene image only; caption is a separate bar below to avoid overlap. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black shadow-lift">
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.imageUrl}
            alt={`Scene ${scene.manifest.id}`}
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

        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Scene {sceneIdx + 1} / {bundle.scenes.length}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
          {scene.manifest.setting}
        </div>
  </div>

      {/* Dedicated cue bar — below the stage so scene badge and dialogue never overlap. */}
      <div className="rounded-xl border border-border bg-bg-elev p-4 shadow-card">
        {displayCue ? (
          <div className="flex items-center gap-3">
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              {speakerName(bundle, displayCue.speakerId)}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm leading-relaxed text-fg">{displayCue.text}</p>
              {needsTts && displayVoiceName && (
                <p className="text-xs text-fg-subtle">Voice: {displayVoiceName} · pitch {pitchForSpeaker(displayCue.speakerId, speakerOrder).toFixed(2)}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{scene.manifest.setting}</span>
              <span className="text-fg-subtle"> · {scene.manifest.mood} · {scene.manifest.time_of_day}</span>
            </p>
            <span className="shrink-0 text-xs text-fg-subtle">{scene.cues.length} cue{scene.cues.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={onAudioTimeUpdate}
        onEnded={() => {
          const nextIdx = sceneIdx + 1;
          if (nextIdx < bundle.scenes.length) setSceneIdx(nextIdx);
          else setPlaying(false);
        }}
        hidden={!scene.audioUrl}
        preload="auto"
      />

      <div className="space-y-3 rounded-2xl border border-border bg-bg-elev p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            disabled={currentTime >= totalDuration && !playing}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {playing ? "Pause" : "Play"}
         </button>
          <button
            onClick={goPrev}
            disabled={sceneIdx === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-sm text-fg-muted transition hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous scene"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Prev
  </button>
          <button
            onClick={goNext}
            disabled={sceneIdx >= bundle.scenes.length - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-sm text-fg-muted transition hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next scene"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
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
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition ${
                  ttsMuted
                    ? "border-border bg-surface text-fg-muted"
                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                }`}
              >
                {ttsMuted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
                {ttsMuted ? "Muted" : "Browser voice"}
              </button>
            ) : null;
          })()}
          <div className="relative ml-auto">
            <button
              onClick={() => setSpeedMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-sm text-fg-muted transition hover:bg-surface hover:text-fg"
              aria-label="Playback speed"
            >
              {rate}x
  </button>
            {speedMenuOpen && (
              <div className="absolute right-0 z-10 mt-1 overflow-hidden rounded-lg border border-border bg-bg-elev p-1 shadow-lift">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setRate(s);
                      setSpeedMenuOpen(false);
                    }}
                    className={`block w-full rounded px-3 py-1 text-left text-sm transition ${
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

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-fg-muted">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="font-mono text-xs tabular-nums text-fg-muted">{formatTime(totalDuration)}</span>
  </div>

        <p className="border-t border-border pt-3 text-xs text-fg-subtle">
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
