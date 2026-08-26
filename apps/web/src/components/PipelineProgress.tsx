"use client";

import {
  Check,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Minus,
  ScanSearch,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { StoryDetail } from "@/components/StoryView";

type StageState = "pending" | "current" | "done" | "skipped" | "failed";

interface Stage {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const STAGES: Stage[] = [
  { key: "ingest", label: "Ingest", description: "Story received", icon: ScanSearch },
  { key: "analyze", label: "Analyze", description: "Gemini extracts scenes + characters", icon: Sparkles },
  { key: "cast", label: "Cast review", description: "You approve the inferred cast", icon: Users },
  { key: "voice", label: "Voice", description: "ElevenLabs narration", icon: Mic2 },
  { key: "visual", label: "Visuals", description: "Illustrations + reference portraits", icon: ImageIcon },
];

function computeStages(
  status: string,
  voiceSkipped: boolean,
  visualSkipped: boolean,
  failedStage: string | null
) {
  const map: Record<string, StageState> = {
    ingest: "done",
    analyze: "pending",
    cast: "pending",
    voice: "pending",
    visual: "pending",
  };
  if (status === "analysis_failed") {
    map.analyze = "failed";
  } else if (status === "failed") {
    const stage = failedStage ?? "visual";
    if (stage === "voice") {
      map.analyze = "done";
      map.cast = "done";
      map.voice = "failed";
    } else {
      map.analyze = "done";
      map.cast = "done";
      map.voice = voiceSkipped ? "skipped" : "done";
      map.visual = "failed";
    }
  }
  if (status === "analyzing") {
    map.analyze = "current";
  } else if (status === "cast_review") {
    map.analyze = "done";
    map.cast = "current";
  } else if (status === "voice_generation") {
    map.analyze = "done";
    map.cast = "done";
    map.voice = voiceSkipped ? "skipped" : "current";
  } else if (status === "visual_generation") {
    map.analyze = "done";
    map.cast = "done";
    map.voice = voiceSkipped ? "skipped" : "done";
    map.visual = visualSkipped ? "skipped" : "current";
  } else if (status === "ready" || status === "assembling") {
    map.analyze = "done";
    map.cast = "done";
    map.voice = voiceSkipped ? "skipped" : "done";
    map.visual = visualSkipped ? "skipped" : "done";
  }
  return map;
}

function indicatorClasses(state: StageState): string {
  switch (state) {
    case "done":
      return "bg-success text-primary-fg border-success";
    case "current":
      return "bg-primary text-primary-fg border-primary";
    case "skipped":
      return "bg-surface text-fg-subtle border-border";
    case "failed":
      return "bg-danger text-primary-fg border-danger";
    default:
      return "bg-bg-elev text-fg-subtle border-border";
  }
}

function labelClasses(state: StageState): string {
  switch (state) {
    case "done":
      return "text-fg";
    case "current":
      return "text-fg";
    case "failed":
      return "text-danger-fg";
    case "skipped":
      return "text-fg-subtle line-through decoration-fg-subtle/50";
    default:
      return "text-fg-muted";
  }
}

export function PipelineProgress({ detail }: { detail: StoryDetail }) {
  const { status, voice_skipped, visual_skipped, failed_stage } = detail.story;
  const states = computeStages(status, voice_skipped, visual_skipped, failed_stage);
  return (
    <ol className="rounded-xl border border-border bg-bg-elev p-2 shadow-card">
      {STAGES.map((stage, i) => {
        const state = states[stage.key];
        const Icon = stage.icon;
        const isLast = i === STAGES.length - 1;
        return (
          <li key={stage.key} className="relative flex items-start gap-3 px-2 py-2">
            <div className="relative flex flex-col items-center">
              <span
                aria-hidden
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${indicatorClasses(state)}`}
              >
                {state === "current" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : state === "done" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : state === "skipped" ? (
                  <Minus className="h-4 w-4" aria-hidden />
                ) : state === "failed" ? (
                  <X className="h-4 w-4" aria-hidden />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden />
                )}
             </span>
              {!isLast && (
                <span
                  aria-hidden
                  className={`mt-1 h-6 w-0.5 rounded-full ${
                    state === "done" || state === "skipped" ? "bg-border-strong" : "bg-border"
                  }`}
                />
              )}
           </div>
            <div className="min-w-0 flex-1 pt-1">
              <p className={`text-sm font-semibold ${labelClasses(state)}`}>
                {stage.label}
                {state === "skipped" && (
                  <span className="ml-1.5 text-xs font-normal text-fg-subtle">(skipped)</span>
                )}
             </p>
              <p className="mt-0.5 text-xs text-fg-muted">{stage.description}</p>
           </div>
         </li>
        );
      })}
   </ol>
  );
}
