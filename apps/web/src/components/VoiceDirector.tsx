"use client";

import { useMemo, useState } from "react";
import { NARRATOR_ID, type CharacterBible } from "@storyframe/schemas";
import { narratorBible } from "@storyframe/pipeline";

interface CastMember {
  characterId: string;
  name: string;
  bible: CharacterBible;
}

interface PreviewInfo {
  generatedVoiceId: string;
  mediaType: string;
  durationSecs?: number;
  url: string;
}

export function VoiceDirector({
  storyId,
  characters,
  voiceEnabled,
  voiceSkipped,
}: {
  storyId: string;
  characters: CastMember[];
  voiceEnabled: boolean;
  voiceSkipped: boolean;
}) {
  const members = useMemo<CastMember[]>(
    () => [
      ...characters,
      { characterId: NARRATOR_ID, name: "Narrator", bible: narratorBible() },
    ],
    [characters]
  );

  const [previews, setPreviews] = useState<Record<string, PreviewInfo[]>>({});
  const [designing, setDesigning] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allCast = members.every((m) => m.bible.voice_id);

  async function design(characterId: string) {
    setDesigning(characterId);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/voice/previews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to design voice");
      setPreviews((prev) => ({ ...prev, [characterId]: data.previews as PreviewInfo[] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to design voice");
    } finally {
      setDesigning(null);
    }
  }

  async function pick(characterId: string, generatedVoiceId: string) {
    setSaving(characterId);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/voice/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, generatedVoiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save voice");
      setPreviews((prev) => ({ ...prev, [characterId]: [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save voice");
    } finally {
      setSaving(null);
    }
  }

  async function narrate() {
    setNarrating(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/voice/narrate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start narration");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start narration");
    } finally {
      setNarrating(false);
    }
  }

  async function setSkipped(skip: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/voice/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update narration");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update narration");
    }
  }

  if (voiceSkipped) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">
          Narration was skipped for this story.
        </p>
        <p className="text-sm text-slate-500">
          You can come back and cast voices whenever you like — the story will move back
          into the voice stage.
        </p>
        <button
          onClick={() => void setSkipped(false)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Re-enable narration
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (!voiceEnabled) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">
          Voice narration is not configured.
        </p>
        <p className="text-sm text-slate-500">
          No ElevenLabs API key is set, so voices can&apos;t be designed. You can skip
          narration and move the story forward without audio.
        </p>
        <button
          onClick={() => void setSkipped(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Skip narration
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Casting Director</h3>
        <p className="mt-1 text-sm text-slate-500">
          Design a distinct voice for each character and the narrator. Previews are
          generated live — pick the one you like, or re-roll.
        </p>
      </div>

      {members.map((member) => {
        const voiceId = member.bible.voice_id;
        const memberPreviews = previews[member.characterId];
        return (
          <div
            key={member.characterId}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{member.name}</p>
                {voiceId ? (
                  <p className="mt-0.5 text-xs text-emerald-600">
                    ✓ Voice cast ({voiceId.slice(0, 12)}…)
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">No voice yet</p>
                )}
              </div>
              <button
                onClick={() => void design(member.characterId)}
                disabled={designing === member.characterId}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {designing === member.characterId
                  ? "Designing…"
                  : voiceId
                    ? "Re-cast"
                    : "Design voice"}
              </button>
            </div>

            {memberPreviews && memberPreviews.length > 0 && (
              <div className="mt-4 space-y-3">
                {memberPreviews.map((preview, i) => (
                  <div
                    key={preview.generatedVoiceId}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <span className="w-6 text-center text-xs font-semibold text-slate-400">
                      {i + 1}
                    </span>
                    <audio controls preload="none" src={preview.url} className="h-9 flex-1" />
                    <button
                      onClick={() => void pick(member.characterId, preview.generatedVoiceId)}
                      disabled={saving === member.characterId}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {saving === member.characterId ? "Saving…" : "Pick this voice"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => void narrate()}
        disabled={!allCast || narrating}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {narrating ? "Starting…" : "Narrate story"}
      </button>
      {!allCast && (
        <p className="text-xs text-slate-400">
          Narrate unlocks once every character and the narrator have a voice.
        </p>
      )}
      <button
        onClick={() => void setSkipped(true)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Skip narration for this story
      </button>
    </div>
  );
}