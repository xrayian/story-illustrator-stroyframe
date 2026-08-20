"use client";

import { useState } from "react";

interface SceneSummary {
  id: string;
  image: { key: string; url: string } | null;
}

/**
 * Phase 4 visual stage: generate reference portraits + scene illustrations,
 * or skip visuals (image generation is a paid Gemini feature). Rendered once
 * the voice stage is done or skipped.
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
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">
          Visuals were skipped for this story.
        </p>
        <p className="text-sm text-slate-500">
          You can generate reference portraits and scene illustrations later — the
          story will move back into the visual stage.
        </p>
        <button
          onClick={() => void trigger("skip", false)}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Updating…" : "Re-enable visuals"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Visual Director</h3>
      <p className="text-sm text-slate-500">
        Generate a canonical reference portrait for each character, then an
        illustration for every scene (style bible + re-anchored portraits).
        Images are generated with Gemini when available, and fall back to the
        free Pollinations.ai endpoint otherwise — errors are shown here rather
        than failing silently.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => void trigger("generate")}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Starting…" : "Generate visuals"}
        </button>
        <button
          onClick={() => void trigger("skip")}
          disabled={saving}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Skip visuals for this story
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {scenes.some((s) => s.image) && (
        <p className="text-xs text-slate-400">
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
      <h3 className="text-lg font-semibold text-slate-900">Scene illustrations</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {illustrated.map((scene) => (
          <figure
            key={scene.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scene.image?.url}
              alt={`Illustration for scene ${scene.id}`}
              className="aspect-video w-full object-cover"
            />
            <figcaption className="px-3 py-2 text-xs font-medium text-slate-500">
              {scene.id}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}