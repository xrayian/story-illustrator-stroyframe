"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Pause,
  Play,
} from "lucide-react";
import type { ParsedBundle, ParsedScene } from "@/lib/parseBundle";

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const scene: ParsedScene | null = bundle.scenes[sceneIdx] ?? null;
  const totalDuration = bundle.totalDuration;

  const activeCue: ActiveCue | null = useMemo(() => {
    if (!scene || scene.cues.length === 0) return null;
    const local = currentTime - scene.startOffset;
    return scene.cues.find((c) => local >= c.start && local <= c.end) ?? null;
  }, [currentTime, scene]);

  // Voice-skipped driver: wall-clock rAF advances currentTime when no audio.
  useEffect(() => {
    if (!playing || scene?.audioUrl) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
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
  }, [playing, scene, sceneIdx, bundle.scenes.length, bundle.scenes, totalDuration, rate]);

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
    setSceneIdx((i) => Math.max(0, i - 1));
    const s = bundle.scenes[Math.max(0, sceneIdx - 1)];
    setCurrentTime(s?.startOffset ?? 0);
  }, [bundle.scenes, sceneIdx]);

  const goNext = useCallback(() => {
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
      {/* Stage */}
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

        {activeCue && (
          <div className="absolute bottom-4 left-1/2 max-w-[80%] -translate-x-1/2 rounded-lg bg-black/65 px-3 py-2 text-center text-sm text-white backdrop-blur-sm shadow-lift">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              {speakerName(bundle, activeCue.speakerId)}
      </span>
            <span>{activeCue.text}</span>
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
          {bundle.manifest.voice_skipped ? " — narration skipped (auto-advancing scenes)" : ""}
  </p>
   </div>
 </div>
  );
}
