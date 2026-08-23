"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, User } from "lucide-react";
import { UNSPECIFIED, type CharacterBible } from "@storyframe/schemas";
import type { StoryCharacter } from "@/components/StoryView";

interface EditableFields {
  name: string;
  role: string;
  apparent_age_range: string;
  gender_expression: string;
  ethnicity_or_culture_cues: string;
  physical_description: string;
  personality_traits: string;
}

const UNSPECIFIED_PLACEHOLDER = "unspecified — only fill in if the story supports it";

function toEditable(bible: CharacterBible): EditableFields {
  return {
    name: bible.name,
    role: bible.role,
    apparent_age_range:
      bible.apparent_age_range === UNSPECIFIED ? "" : bible.apparent_age_range,
    gender_expression:
      bible.gender_expression === UNSPECIFIED ? "" : bible.gender_expression,
    ethnicity_or_culture_cues:
      bible.ethnicity_or_culture_cues === UNSPECIFIED ? "" : bible.ethnicity_or_culture_cues,
    physical_description: bible.physical_description,
    personality_traits: bible.personality_traits.join(", "),
  };
}

function fromEditable(
  fields: EditableFields
): Omit<CharacterBible, "id" | "voice_id" | "reference_image_url" | "locked_identity_prompt" | "version"> {
  return {
    name: fields.name.trim(),
    role: fields.role.trim(),
    apparent_age_range: fields.apparent_age_range.trim(),
    gender_expression: fields.gender_expression.trim(),
    ethnicity_or_culture_cues: fields.ethnicity_or_culture_cues.trim(),
    physical_description: fields.physical_description.trim(),
    personality_traits: fields.personality_traits
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export function CastReview({
  storyId,
  characters,
  storyTitle,
}: {
  storyId: string;
  characters: StoryCharacter[];
  storyTitle: string;
}) {
  const initial = useMemo(
    () => Object.fromEntries(characters.map((c) => [c.characterId, toEditable(c.bible)])),
    [characters]
  );
  const [edits, setEdits] = useState<Record<string, EditableFields>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allApproved = characters.every((c) => c.approved);
  const allNamed = characters.every((c) => (edits[c.characterId]?.name ?? "").trim() !== "");
  const approvedCount = characters.filter((c) => c.approved).length;

  function setField(characterId: string, field: keyof EditableFields, value: string) {
    setEdits((prev) => ({
      ...prev,
      [characterId]: { ...prev[characterId], [field]: value },
    }));
  }

  async function approve() {
    setSaving(true);
    setError(null);
    try {
      const payload = characters.map((c) => ({
        characterId: c.characterId,
        edits: fromEditable(edits[c.characterId]),
      }));
      const res = await fetch(`/api/stories/${storyId}/cast/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characters: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve cast");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve cast");
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg shadow-sm placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring";

  if (saved || allApproved) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-bg p-4">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-primary-fg">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
      </span>
          <div>
            <p className="font-display text-sm font-semibold text-success-fg">
              Cast approved — voice and visual generation are now unlocked.
          </p>
            <p className="mt-1 text-sm text-success-fg/80">
              Voice and visual stages will run next in the pipeline.
          </p>
        </div>
      </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-bg-elev shadow-card">
          {characters.map((c) => (
            <li key={c.characterId} className="flex items-center gap-2 px-4 py-3 text-sm">
              <Check className="h-4 w-4 text-success" aria-hidden />
              <span className="font-medium text-fg">{c.bible.name}</span>
              <span className="text-fg-muted">— {c.bible.role}</span>
              <span className="ml-auto font-mono text-xs text-fg-subtle">v{c.version}</span>
          </li>
          ))}
      </ul>
    </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Review the cast</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {storyTitle} — {characters.length} character{characters.length === 1 ? "" : "s"},{" "}
          {approvedCount} already approved.
      </p>
        <p className="mt-1 text-xs text-fg-subtle">
          Fields the story gave no evidence for are left empty — fill them in only if you
          want to. Nothing is generated until you approve.
      </p>
    </div>

      {characters.map((c) => {
        const f = edits[c.characterId];
        if (!f) return null;
        return (
          <CharacterCard
            key={c.characterId}
            title={`${c.name}${c.approved ? " (approved)" : ""}`}
            fields={f}
            onChange={(field, value) => setField(c.characterId, field, value)}
            inputClass={inputClass}
          />
        );
      })}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger-fg"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
   </div>
      )}

      <button
        onClick={() => void approve()}
        disabled={saving || !allNamed}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Approving…
       </>
        ) : (
          <>
            <Check className="h-4 w-4" aria-hidden />
            Approve cast
       </>
        )}
  </button>
</div>
  );
}

function CharacterCard({
  title,
  fields,
  onChange,
  inputClass,
}: {
  title: string;
  fields: EditableFields;
  onChange: (field: keyof EditableFields, value: string) => void;
  inputClass: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-4 w-4" aria-hidden />
    </span>
        <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
  </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={fields.name} onChange={(e) => onChange("name", e.target.value)} />
       </Field>
        <Field label="Role">
          <input className={inputClass} value={fields.role} onChange={(e) => onChange("role", e.target.value)} />
       </Field>
        <Field label="Apparent age range">
          <input
            className={inputClass}
            placeholder={UNSPECIFIED_PLACEHOLDER}
            value={fields.apparent_age_range}
            onChange={(e) => onChange("apparent_age_range", e.target.value)}
          />
       </Field>
        <Field label="Gender expression">
          <input
            className={inputClass}
            placeholder={UNSPECIFIED_PLACEHOLDER}
            value={fields.gender_expression}
            onChange={(e) => onChange("gender_expression", e.target.value)}
          />
       </Field>
        <Field label="Ethnicity / culture cues" className="sm:col-span-2">
          <input
            className={inputClass}
            placeholder={`${UNSPECIFIED_PLACEHOLDER}. Never guessed from a name.`}
            value={fields.ethnicity_or_culture_cues}
            onChange={(e) => onChange("ethnicity_or_culture_cues", e.target.value)}
          />
       </Field>
        <Field label="Physical description" className="sm:col-span-2">
          <textarea
            className={inputClass}
            rows={2}
            value={fields.physical_description}
            onChange={(e) => onChange("physical_description", e.target.value)}
          />
       </Field>
        <Field label="Personality traits (comma-separated)" className="sm:col-span-2">
          <input
            className={inputClass}
            value={fields.personality_traits}
            onChange={(e) => onChange("personality_traits", e.target.value)}
          />
       </Field>
  </div>
</div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="block text-xs font-medium text-fg-muted">{label}</span>
      {children}
  </label>
  );
}
