"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Play,
  RefreshCw,
  Upload,
} from "lucide-react";
import type { CharacterBible, StoryManifest } from "@storyframe/schemas";
import { CastReview } from "@/components/CastReview";
import { VoiceDirector } from "@/components/VoiceDirector";
import { VisualDirector, SceneGallery } from "@/components/VisualDirector";
import { PipelineProgress } from "@/components/PipelineProgress";

export interface StoryCharacter {
  characterId: string;
  name: string;
  role: string;
  bible: CharacterBible;
  version: number;
  approved: boolean;
}

export interface StoryDetail {
  story: {
    id: string;
    title: string;
    status: string;
    source_url: string | null;
    voice_skipped: boolean;
    visual_skipped: boolean;
    created_at: string;
  };
  voice_enabled: boolean;
  characters: StoryCharacter[];
  sceneCount: number;
  scenes: Array<{ id: string; image: { key: string; url: string } | null }>;
  manifest: StoryManifest | null;
}

const POLL_INTERVAL_MS = 3000;

const STATUS_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }> = {
  created: { label: "Queued", icon: Loader2 },
  analyzing: { label: "Analyzing", icon: Loader2 },
  analysis_failed: { label: "Analysis failed", icon: AlertCircle },
  cast_review: { label: "Cast review", icon: Mic2 },
  voice_generation: { label: "Voicing", icon: Mic2 },
  visual_generation: { label: "Illustrating", icon: ImageIcon },
  assembling: { label: "Assembling", icon: Loader2 },
  ready: { label: "Ready", icon: CheckCircle2 },
  failed: { label: "Failed", icon: AlertCircle },
};

export function StoryView({ storyId }: { storyId: string }) {
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/stories/${storyId}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setError("Story not found.");
          return;
        }
        const data = (await res.json()) as StoryDetail;
        if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? "Failed to load");
        if (!cancelled) {
          setDetail(data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    }
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [storyId]);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">{error}</p>
          <button
            onClick={() => location.reload()}
            className="mt-1 text-xs font-semibold underline underline-offset-2"
          >
            Retry
         </button>
       </div>
     </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-elev p-6 text-sm text-fg-muted shadow-card">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading story…
     </div>
    );
  }

  const { story, characters } = detail;
  const meta = STATUS_META[story.status] ?? { label: story.status, icon: Loader2 };
  const StatusIcon = meta.icon;

  return (
    <div className="space-y-6">
      <StoryHeader title={story.title} statusLabel={meta.label} StatusIcon={StatusIcon} />

      {story.status === "created" || story.status === "analyzing" ? (
        <>
          <PipelineProgress detail={detail} />
          <StageNotice
            title="Analyzing the story"
            description="Gemini is extracting characters and scenes. This usually takes under a minute."
            pulse
          />
        </>
      ) : null}

      {story.status === "analysis_failed" ? (
        <>
          <PipelineProgress detail={detail} />
          <AnalysisFailed storyId={storyId} />
        </>
      ) : null}

      {story.status === "cast_review" ? (
        <>
          <PipelineProgress detail={detail} />
          <CastReview storyId={storyId} characters={characters} storyTitle={story.title} />
          {characters.every((c) => c.approved) && (
            <VoiceDirector
              storyId={storyId}
              characters={characters}
              voiceEnabled={detail.voice_enabled}
              voiceSkipped={story.voice_skipped}
            />
          )}
        </>
      ) : null}

      {story.status === "voice_generation" ? (
        <>
          <PipelineProgress detail={detail} />
          <StageNotice
            title="Narrating the story"
            description="Each line is being voiced with its character's voice. This can take a few minutes for longer stories."
            pulse
          />
        </>
      ) : null}

      {story.status === "visual_generation" || story.status === "assembling" ? (
        <>
          <PipelineProgress detail={detail} />
          <StageNotice
            title="Generating reference portraits and scene illustrations"
            description={
              story.status === "assembling"
                ? "Wrapping up — packing the .svmp bundle."
                : "One portrait per character, then one illustration per scene with the canonical reference portraits re-anchored."
            }
            pulse={story.status !== "assembling"}
          />
        </>
      ) : null}

      {story.status === "ready" ? (
        <ReadyView detail={detail} storyId={storyId} />
      ) : null}

      {story.status === "failed" ? (
        <>
          <PipelineProgress detail={detail} />
          <PipelineFailed storyId={storyId} />
        </>
      ) : null}
   </div>
  );
}

function StoryHeader({
  title,
  statusLabel,
  StatusIcon,
}: {
  title: string;
  statusLabel: string;
  StatusIcon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Story</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg text-balance sm:text-3xl">
          {title}
        </h1>
    </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev px-3 py-1 text-xs font-medium text-fg-muted shadow-card">
        <StatusIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
        {statusLabel}
     </span>
   </header>
  );
}

function StageNotice({
  title,
  description,
  pulse,
}: {
  title: string;
  description: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-elev p-5 shadow-card">
      {pulse && (
        <span className="mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 animate-pulse-soft rounded-full bg-primary" aria-hidden />
      )}
      <div>
        <p className="font-display text-sm font-semibold text-fg">{title}</p>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
     </div>
   </div>
  );
}

function ReadyView({ detail, storyId }: { detail: StoryDetail; storyId: string }) {
  const { story } = detail;
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-success/30 bg-success-bg p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-primary-fg">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-success-fg">
              {story.voice_skipped
                ? "Story ready — narration skipped."
                : `Story ready — audio generated across ${detail.sceneCount} scene${detail.sceneCount === 1 ? "" : "s"}.`}
            </p>
            <p className="mt-1 text-sm text-success-fg/80">
              {story.voice_skipped ? "You can return and cast voices later if you like." : "Voice stage complete."}
            </p>
          </div>
        </div>
         {story.voice_skipped && <ReenableNarration storyId={storyId} />}
      </div>

      <SceneGallery scenes={detail.scenes} manifest={detail.manifest} characters={detail.characters} />

      {!detail.scenes.some((s) => s.image) && (
        <VisualDirector
          storyId={storyId}
          scenes={detail.scenes}
          visualSkipped={story.visual_skipped}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={`/play/${storyId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover"
        >
          <Play className="h-4 w-4" aria-hidden />
          Play story
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
       </a>
        <a
          href={`/api/stories/${storyId}/bundle`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download .svmp
       </a>
        <Link
          href="/play"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Open local .svmp
       </Link>
     </div>
   </div>
  );
}

function ReenableNarration({ storyId }: { storyId: string }) {
  const [saving, setSaving] = useState(false);
  async function reenable() {
    setSaving(true);
    try {
      await fetch(`/api/stories/${storyId}/voice/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: false }),
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <button
      onClick={() => void reenable()}
      disabled={saving}
      className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-primary-fg transition hover:bg-success/90 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mic2 className="h-3.5 w-3.5" aria-hidden />}
      {saving ? "Updating…" : "Re-enable narration"}
   </button>
  );
}

function PipelineFailed({ storyId }: { storyId: string }) {
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await fetch(`/api/stories/${storyId}/visuals/generate`, { method: "POST" });
      location.reload();
    } catch {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-4 rounded-xl border border-danger/30 bg-danger-bg p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-primary-fg">
          <AlertCircle className="h-5 w-5" aria-hidden />
       </span>
        <div>
          <p className="font-display text-base font-semibold text-danger-fg">Generation failed</p>
          <p className="mt-1 text-sm text-danger-fg/85">
            The visual stage couldn&apos;t complete (the Gemini, Hugging Face, and free
            Pollinations image providers all failed — quota or safety-filter errors surface
            here). Finished portraits and illustrations are kept, so retrying skips them.
            You can also skip visuals instead.
         </p>
       </div>
     </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void retry()}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-primary-fg transition hover:bg-danger/90 disabled:opacity-50"
        >
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          {retrying ? "Retrying…" : "Retry visuals"}
       </button>
        <SkipVisualsButton storyId={storyId} />
     </div>
   </div>
  );
}

function SkipVisualsButton({ storyId }: { storyId: string }) {
  const [saving, setSaving] = useState(false);
  async function skip() {
    setSaving(true);
    try {
      await fetch(`/api/stories/${storyId}/visuals/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: true }),
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <button
      onClick={() => void skip()}
      disabled={saving}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {saving ? "Updating…" : "Skip visuals"}
   </button>
  );
}

function AnalysisFailed({ storyId }: { storyId: string }) {
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await fetch(`/api/stories/${storyId}/analyze`, { method: "POST" });
      location.reload();
    } catch {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-danger/30 bg-danger-bg p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-primary-fg">
          <AlertCircle className="h-5 w-5" aria-hidden />
       </span>
        <div>
          <p className="font-display text-base font-semibold text-danger-fg">Analysis failed</p>
          <p className="mt-1 text-sm text-danger-fg/85">
            The story couldn&apos;t be analyzed. You can retry without being charged again for
            completed stages.
         </p>
       </div>
     </div>
      <button
        onClick={() => void retry()}
        disabled={retrying}
        className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-primary-fg transition hover:bg-danger/90 disabled:opacity-50"
      >
        {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
        {retrying ? "Retrying…" : "Retry analysis"}
     </button>
   </div>
  );
}
