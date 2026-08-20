"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        // Force the next audio to start at zero when play resumes
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
    // pause any prior audio when switching scenes
    const audio = audioRef.current;
    if (audio && scene?.audioUrl) {
      audio.src = scene.audioUrl;
      audio.currentTime = Math.max(0, currentTime - scene.startOffset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdx]);

  if (!scene) {
    return <p className="text-sm text-slate-500">No scenes to play.</p>;
  }

  const sceneLocal = currentTime - scene.startOffset;
  const sceneProgress = scene.duration > 0 ? Math.min(1, sceneLocal / scene.duration) : 0;

  return (
    <div className="space-y-3">
      {/* Stage */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
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
          <div className="flex h-full items-center justify-center text-slate-500">
            <p className="text-sm">No illustration.</p>
          </div>
        )}

        {/* Scene label */}
        <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Scene {sceneIdx + 1} / {bundle.scenes.length}
        </div>

        {/* Caption overlay */}
        {activeCue && (
          <div className="absolute bottom-6 left-1/2 max-w-[80%] -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-center text-sm text-white">
            <span className="mr-2 text-xs uppercase tracking-wider text-amber-300">
              {speakerName(bundle, activeCue.speakerId)}
            </span>
            <span>{activeCue.text}</span>
          </div>
        )}
      </div>

      {/* Hidden audio for voiced bundles */}
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

      {/* Controls */}
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white"
            disabled={currentTime >= totalDuration && !playing}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={goPrev}
            disabled={sceneIdx === 0}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            onClick={goNext}
            disabled={sceneIdx >= bundle.scenes.length - 1}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 disabled:opacity-30"
          >
            Next →
          </button>
          <div className="relative">
            <button
              onClick={() => setSpeedMenuOpen((o) => !o)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600"
            >
              {rate}x
            </button>
            {speedMenuOpen && (
              <div className="absolute right-0 z-10 mt-1 rounded border border-slate-200 bg-white p-1 shadow">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setRate(s);
                      setSpeedMenuOpen(false);
                    }}
                    className={`block w-full rounded px-3 py-1 text-sm text-left ${
                      s === rate ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
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
          <span className="text-xs tabular-nums text-slate-500">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 accent-slate-900"
          />
          <span className="text-xs tabular-nums text-slate-500">{formatTime(totalDuration)}</span>
        </div>

        <p className="text-xs text-slate-400">
          {bundle.manifest.title}
          {bundle.manifest.voice_skipped ? " — narration skipped (auto-advancing scenes)" : ""}
        </p>
      </div>
    </div>
  );
}
