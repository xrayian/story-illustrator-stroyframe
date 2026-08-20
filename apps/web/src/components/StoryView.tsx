"use client";

import { useEffect, useState } from "react";
import type { CharacterBible, StoryManifest } from "@storyframe/schemas";
import { CastReview } from "@/components/CastReview";
import { VoiceDirector } from "@/components/VoiceDirector";

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
    created_at: string;
  };
  voice_enabled: boolean;
  characters: StoryCharacter[];
  sceneCount: number;
  manifest: StoryManifest | null;
}

const POLL_INTERVAL_MS = 3000;

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
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
        <button
          onClick={() => location.reload()}
          className="ml-2 font-semibold underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !detail) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const { story, characters } = detail;

  if (story.status === "created" || story.status === "analyzing") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">{story.title}</p>
        <p className="text-sm text-slate-500">
          Analyzing the story… <span className="animate-pulse">▍</span>
        </p>
      </div>
    );
  }

  if (story.status === "analysis_failed") {
    return <AnalysisFailed storyId={storyId} />;
  }

  if (story.status === "cast_review") {
    const allApproved = characters.every((c) => c.approved);
    return (
      <div className="space-y-6">
        <CastReview storyId={storyId} characters={characters} storyTitle={story.title} />
        {allApproved && (
          <VoiceDirector
            storyId={storyId}
            characters={characters}
            voiceEnabled={detail.voice_enabled}
            voiceSkipped={story.voice_skipped}
          />
        )}
      </div>
    );
  }

  if (story.status === "voice_generation") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">{story.title}</p>
        <p className="text-sm text-slate-500">
          Narrating the story… <span className="animate-pulse">▍</span>
        </p>
        <p className="text-xs text-slate-400">
          Each line is being voiced with its character&apos;s voice. This can take a few
          minutes for longer stories.
        </p>
      </div>
    );
  }

  if (story.status === "ready") {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">
          {story.voice_skipped
            ? "Story ready — narration skipped."
            : `Story ready — audio track generated across ${detail.sceneCount} scene${detail.sceneCount === 1 ? "" : "s"}.`}
        </p>
        <p className="text-sm text-emerald-700">
          {story.voice_skipped
            ? "You can return and cast voices later if you like."
            : "Visuals and bundle assembly come online in the next phases."}
        </p>
        {story.voice_skipped && <ReenableNarration storyId={storyId} />}
      </div>
    );
  }

  if (story.status === "failed") {
    return <NarrationFailed storyId={storyId} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">{story.title}</p>
      <p className="text-sm text-slate-500">
        Pipeline stage: {story.status} (voice and visuals come online in later phases).
      </p>
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
      className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
    >
      {saving ? "Updating…" : "Re-enable narration"}
    </button>
  );
}

function NarrationFailed({ storyId }: { storyId: string }) {
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await fetch(`/api/stories/${storyId}/voice/narrate`, { method: "POST" });
      location.reload();
    } catch {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-800">Narration failed</p>
      <p className="text-sm text-red-700">
        The story&apos;s audio couldn&apos;t be generated. Finished lines are kept, so retrying
        resumes without re-charging for them.
      </p>
      <button
        onClick={() => void retry()}
        disabled={retrying}
        className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry narration"}
      </button>
    </div>
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
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-800">Analysis failed</p>
      <p className="text-sm text-red-700">
        The story couldn&apos;t be analyzed. You can retry without being charged again for
        completed stages.
      </p>
      <button
        onClick={() => void retry()}
        disabled={retrying}
        className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry analysis"}
      </button>
    </div>
  );
}