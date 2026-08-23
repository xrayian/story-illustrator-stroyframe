"use client";

import { useState } from "react";
import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Mic2,
  RefreshCw,
  SkipForward,
  Sparkles,
  User,
} from "lucide-react";
import type { StoryManifest } from "@storyframe/schemas";

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

export function SceneGallery({
  scenes,
  manifest,
  characters,
}: {
  scenes: SceneSummary[];
  manifest?: StoryManifest | null;
  characters?: Array<{ characterId: string; name: string }>;
}) {
  if (scenes.length === 0) return null;
  const nameById = new Map<string, string>();
  if (characters) for (const c of characters) nameById.set(c.characterId, c.name);
  nameById.set("narrator", "Narrator");
  const manifestById = new Map<string, (typeof manifest extends null | undefined ? never : NonNullable<typeof manifest>["scenes"][number])>();
  if (manifest) for (const s of manifest.scenes) manifestById.set(s.id, s as never);

  const illustratedCount = scenes.filter((s) => s.image).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-semibold text-fg">Scenes</h3>
        <span className="text-xs text-fg-subtle">
          {illustratedCount}/{scenes.length} illustrated
          {manifest ? ` · ${manifest.scenes.reduce((n, s) => n + s.lines.length, 0)} lines` : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {scenes.map((scene) => {
          const m = manifestById.get(scene.id) as unknown as
            | { setting: string; time_of_day: string; mood: string; characters_present: string[]; lines: Array<{ speaker_id: string; text: string }> }
            | undefined;
          const speakers = m ? [...new Set(m.lines.map((l) => l.speaker_id))] : [];
          return (
            <figure
              key={scene.id}
              className="group overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              {scene.image?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scene.image.url}
                  alt={`Illustration for scene ${scene.id}`}
                  className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-surface text-fg-subtle">
                  <ImageIcon className="h-6 w-6" aria-hidden />
                  <span className="text-xs">No illustration yet</span>
                </div>
              )}
              <figcaption className="space-y-1.5 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-fg">{scene.id}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${scene.image ? "bg-success-bg text-success-fg" : "bg-surface text-fg-muted"}`}>
                    {scene.image ? "illustrated" : "pending"}
                  </span>
                </div>
                {m ? (
                  <>
                    <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">
                      <span className="font-medium text-fg">{m.setting}</span>
                      {m.time_of_day ? ` · ${m.time_of_day}` : ""} · {m.mood}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {m.characters_present.length > 0 ? (
                        m.characters_present.map((cid) => (
                          <span key={cid} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-fg-muted">
                            <User className="h-3 w-3" aria-hidden />
                            {nameById.get(cid) ?? cid}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-fg-subtle">No characters</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                      <Mic2 className="h-3 w-3 text-fg-subtle" aria-hidden />
                      <span className="text-[11px] text-fg-subtle">
                        {m.lines.length} line{m.lines.length === 1 ? "" : "s"}
                      </span>
                      {speakers.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {speakers.map((sid) => (
                            <span key={sid} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                              {nameById.get(sid) ?? sid}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {m.lines.length > 0 && (
                      <p className="line-clamp-2 text-xs italic text-fg-subtle">“{m.lines[0].text.slice(0, 120)}{m.lines[0].text.length > 120 ? "…" : ""}”</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-fg-subtle">No script data</p>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
