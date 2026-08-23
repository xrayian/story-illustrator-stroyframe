"use client";

import { useState } from "react";
import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  SkipForward,
  Sparkles,
} from "lucide-react";

interface SceneSummary {
  id: string;
  image: { key: string; url: string } | null;
}

/**
 * Phase 4 visual stage: generate reference portraits + scene illustrations,
 * or skip visuals (image generation is a paid feature). Rendered once the
 * voice stage is done or skipped.
 */
export function VisualDirector({
  storyId,
  scenes,
  visualSkipped,
}: {
  storyId: string;
  scenes: SceneSummary[];
  visualSkipped: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger(action: "generate" | "skip", skip = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        action === "generate"
          ? `/api/stories/${storyId}/visuals/generate`
          : `/api/stories/${storyId}/visuals/skip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: action === "skip" ? JSON.stringify({ skip }) : undefined,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (visualSkipped) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-bg-elev p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-fg-muted">
            <SkipForward className="h-5 w-5" aria-hidden />
     </span>
          <div>
            <p className="font-display text-sm font-semibold text-fg">Visuals were skipped for this story</p>
            <p className="mt-1 text-sm text-fg-muted">
              You can generate reference portraits and scene illustrations later — the story
              will move back into the visual stage.
         </p>
       </div>
     </div>
        <button
          onClick={() => void trigger("skip", false)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          {saving ? "Updating…" : "Re-enable visuals"}
     </button>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger-fg">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
     </div>
        )}
   </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-bg-elev p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ImageIcon className="h-5 w-5" aria-hidden />
     </span>
        <div>
          <h3 className="font-display text-base font-semibold text-fg">Visual Director</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Generate a canonical reference portrait for each character, then an illustration
            for every scene (style bible + re-anchored portraits). Images route through
            Gemini, Hugging Face, or the free Pollinations endpoint — errors surface here
            rather than failing silently.
       </p>
      </div>
    </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void trigger("generate")}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {saving ? "Starting…" : "Generate visuals"}
      </button>
        <button
          onClick={() => void trigger("skip")}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg disabled:opacity-50"
        >
          <SkipForward className="h-4 w-4" aria-hidden />
          Skip visuals for this story
      </button>
    </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger-fg">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
    </div>
      )}
      {scenes.some((s) => s.image) && (
        <p className="text-xs text-fg-subtle">
          Some scenes already have illustrations — re-running skips them.
      </p>
      )}
  </div>
  );
}

export function SceneGallery({ scenes }: { scenes: SceneSummary[] }) {
  const illustrated = scenes.filter((s) => s.image);
  if (illustrated.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-semibold text-fg">Scene illustrations</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {illustrated.map((scene) => (
          <figure
            key={scene.id}
            className="group overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scene.image?.url}
              alt={`Illustration for scene ${scene.id}`}
              className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <figcaption className="px-3 py-2 text-xs font-medium text-fg-muted">
              {scene.id}
           </figcaption>
         </figure>
        ))}
  </div>
</div>
  );
}
