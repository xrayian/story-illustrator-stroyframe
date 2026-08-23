"use client";

import type { StoryDetail } from "@/components/StoryView";

/** Phase 7: pipeline progress checklist rendered above the stage-specific UI. */
const STAGES: { key: string; label: string; description: string }[] = [
  { key: "ingest", label: "Ingest", description: "Story received" },
  { key: "analyze", label: "Analyze", description: "Gemini extracts scenes + characters" },
  { key: "cast", label: "Cast review", description: "You approve the inferred cast (blocking gate)" },
  { key: "voice", label: "Voice", description: "ElevenLabs narration" },
  { key: "visual", label: "Visuals", description: "Illustrations + reference portraits" },
  { key: "ready", label: "Ready", description: "Bundle downloadable, player available" },
];

/**
 * Maps a story row's database status onto a per-stage completion map.
 * Stages use these completion states: pending, current, done, skipped, failed.
 */
function computeStages(status: string, voiceSkipped: boolean, visualSkipped: boolean) {
  // Order: ingest < analyze < cast < voice < visual < ready
  type State = "pending" | "current" | "done" | "skipped" | "failed";
  const map: Record<string, State> = {
    ingest: "done",
    analyze: "pending",
    cast: "pending",
    voice: "pending",
    visual: "pending",
    ready: "pending",
  };
  if (status === "failed" || status === "analysis_failed") {
    if (status === "analysis_failed") map.analyze = "failed";
    else map.visual = "failed";
  }
  // Order of in-flight pips vs done:
  if (status === "analyzing") {
    map.analyze = "current";
  } else if (status === "cast_review") {
    map.analyze = "done";
    map.cast = "current";
  } else if (status === "voice_generation") {
    map.analyze = "done";
    map.cast = "done";
    map.voice = voiceSkipped ? "skipped" : "current";
    if (voiceSkipped) {
      map.visual = "pending";
    }
  } else if (status === "visual_generation") {
    map.analyze = "done";
    map.cast = "done";
    map.voice = voiceSkipped ? "skipped" : "done";
    map.visual = visualSkipped ? "skipped" : "current";
    if (visualSkipped) {
      map.ready = "current";
    }
  } else if (status === "ready") {
    map.analyze = "done";
    map.cast = "done";
    map.voice = voiceSkipped ? "skipped" : "done";
    map.visual = visualSkipped ? "skipped" : "done";
    map.ready = "done";
  }
  return map;
}

function symbolFor(state: string): string {
  switch (state) {
    case "done": return "✓";
    case "current": return "▍";
    case "skipped": return "—";
    case "failed": return "!";
    default: return "○";
  }
}

function colorFor(state: string): string {
  switch (state) {
    case "done": return "text-emerald-600";
    case "current": return "text-slate-900 animate-pulse";
    case "skipped": return "text-slate-400";
    case "failed": return "text-red-700";
    default: return "text-slate-300";
  }
}

export function PipelineProgress({ detail }: { detail: StoryDetail }) {
  const { status, voice_skipped, visual_skipped } = detail.story;
  const states = computeStages(status, voice_skipped, visual_skipped);
  return (
    <ol className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      {STAGES.map((stage, i) => (
        <li key={stage.key} className="flex items-start gap-2">
          <span className={`mt-0.5 font-mono ${colorFor(states[stage.key])}`}>
            {symbolFor(states[stage.key])}
          </span>
          <span className="flex-1">
            <span className="font-medium text-slate-800">
              {i + 1}. {stage.label}
              {states[stage.key] === "skipped" && (
                <span className="ml-1 text-xs text-slate-400">(skipped)</span>
              )}
            </span>
            <span className="block text-xs text-slate-500">{stage.description}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}