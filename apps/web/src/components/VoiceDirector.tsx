"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Mic2,
  SkipForward,
  Sparkles,
} from "lucide-react";
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
  const [pickedVoices, setPickedVoices] = useState<Record<string, string>>({});

  const effectiveVoiceId = useCallback(
    (characterId: string, bibleVoiceId: string | null) => pickedVoices[characterId] ?? bibleVoiceId,
    [pickedVoices]
  );

  const allCast = members.every((m) => effectiveVoiceId(m.characterId, m.bible.voice_id));

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
      const voiceId = (data.voiceId as string) ?? generatedVoiceId;
      setPickedVoices((prev) => ({ ...prev, [characterId]: voiceId }));
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
      const res = await fetch(`/api/stories/${storyId}/voice/narrate`, { method: "POST" });
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
      <div className="space-y-4 rounded-xl border border-border bg-bg-elev p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-fg-muted">
            <SkipForward className="h-5 w-5" aria-hidden />
      </span>
          <div>
            <p className="font-display text-sm font-semibold text-fg">Narration was skipped for this story</p>
            <p className="mt-1 text-sm text-fg-muted">
              You can come back and cast voices whenever you like — the story will move back into
              the voice stage.
          </p>
        </div>
      </div>
        <button
          onClick={() => void setSkipped(false)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover"
        >
          <Mic2 className="h-4 w-4" aria-hidden />
          Re-enable narration
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

  if (!voiceEnabled) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-bg-elev p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-fg">
            <AlertCircle className="h-5 w-5" aria-hidden />
      </span>
          <div>
            <p className="font-display text-sm font-semibold text-fg">Voice narration is not configured</p>
            <p className="mt-1 text-sm text-fg-muted">
              No ElevenLabs API key is set, so voices can&apos;t be designed. You can skip narration
              and move the story forward without audio.
          </p>
        </div>
      </div>
        <button
          onClick={() => void setSkipped(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover"
        >
          <SkipForward className="h-4 w-4" aria-hidden />
          Skip narration
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
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-semibold text-fg">Casting Director</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Design a distinct voice for each character and the narrator. Previews are generated
          live — pick the one you like, or re-roll.
      </p>
    </div>

      {members.map((member) => {
        const voiceId = effectiveVoiceId(member.characterId, member.bible.voice_id);
        const memberPreviews = previews[member.characterId];
        return (
          <div
            key={member.characterId}
            className="rounded-2xl border border-border bg-bg-elev p-5 shadow-card"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
                    voiceId ? "bg-success text-primary-fg" : "bg-primary/10 text-primary"
                  }`}
                >
                  {voiceId ? <Check className="h-4 w-4" aria-hidden /> : <Mic2 className="h-4 w-4" aria-hidden />}
           </span>
                <div>
                  <p className="font-display text-sm font-semibold text-fg">{member.name}</p>
                  {voiceId ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-success-fg">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      Voice cast · {voiceId.slice(0, 12)}…
                </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-fg-subtle">No voice yet</p>
                  )}
            </div>
          </div>
              <button
                onClick={() => void design(member.characterId)}
                disabled={designing === member.characterId}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {designing === member.characterId ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Designing…
             </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    {voiceId ? "Re-cast" : "Design voice"}
             </>
                )}
          </button>
        </div>

            {memberPreviews && memberPreviews.length > 0 && (
              <div className="mt-4 space-y-2">
                {memberPreviews.map((preview, i) => (
                  <div
                    key={preview.generatedVoiceId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-bg p-3"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[11px] font-semibold text-fg-muted">
                      {i + 1}
                </span>
                    <audio controls preload="none" src={preview.url} className="h-9 flex-1" />
                    <button
                      onClick={() => void pick(member.characterId, preview.generatedVoiceId)}
                      disabled={saving === member.characterId}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-primary-fg transition hover:bg-success/90 disabled:opacity-50"
                    >
                      {saving === member.characterId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Pick this voice
                </button>
              </div>
                ))}
          </div>
            )}
      </div>
        );
      })}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger-fg">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
  </div>
      )}

      <button
        onClick={() => void narrate()}
        disabled={!allCast || narrating}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {narrating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Starting…
     </>
        ) : (
          <>
            <Mic2 className="h-4 w-4" aria-hidden />
            Narrate story
     </>
        )}
 </button>
      {!allCast && (
        <p className="text-xs text-fg-subtle">
          Narrate unlocks once every character and the narrator have a voice.
  </p>
      )}
      <button
        onClick={() => void setSkipped(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-elev px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface hover:text-fg"
      >
        <SkipForward className="h-4 w-4" aria-hidden />
        Skip narration for this story
 </button>
</div>
  );
}
