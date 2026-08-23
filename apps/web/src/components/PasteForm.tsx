"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BookOpen, Sparkles } from "lucide-react";

const SAMPLE_STORY = `The Paper Lantern

Mae was twelve the summer she found the lantern on the attic shelf. It was smaller than her palm and folded like a flower waiting to open. She carried it downstairs and set it on the windowsill.

Tobias, her older brother, laughed. "It's just paper, Mae."

"Maybe," she said. "But paper remembers light."

That night, after the lamps were out, she unfolded it. The paper bloomed into a soft yellow bell, and inside, a tiny flame appeared — too small to burn, too steady to be wind. It hummed, very faintly, like a bee caught in a jar.

She set it back on the sill and watched it glow against the rain. Somewhere across the rooftops, another lantern answered — a blue one, in a window she had never noticed before.

The next morning, she asked Tobias about the blue light. He looked at her for a long moment.

"They say the lanterns are how the old houses say goodnight to each other," he said. "I thought that was just a story."

"Maybe it is," Mae said. "But look — it's still burning."

And it was.`;

export function PasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const chars = text.length;
    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 220));
    return { chars, words, minutes };
  }, [text]);

  function loadSample() {
    setText(SAMPLE_STORY);
    setTitle("The Paper Lantern");
    setError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!rightsAccepted) {
      setError("Please acknowledge the copyright notice to continue.");
      return;
    }
    if (stats.words < 20) {
      setError("Story needs to be at least a few sentences long to analyze.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          title: title.trim() || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
          rightsAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      router.push(`/stories/${data.storyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg shadow-sm placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="text" className="block text-sm font-medium text-fg">
            Story text
       </label>
          <button
            type="button"
            onClick={loadSample}
            disabled={text.length > 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Try sample
       </button>
     </div>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          required
          placeholder="Paste the full story here — Wattpad, Facebook, wherever."
          className={`${inputClass} resize-y scrollbar-thin`}
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
          <span className="font-mono tabular-nums">
            {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} chars
        </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" aria-hidden />
            ~{stats.minutes} min narrated
        </span>
     </div>
   </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-fg">
            Title <span className="text-fg-subtle">(optional</span>
       </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled story"
            className={inputClass}
          />
     </div>
        <div>
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-fg">
            Source URL <span className="text-fg-subtle">(optional</span>
       </label>
          <input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
     </div>
   </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3 text-sm text-fg-muted transition hover:border-border-strong">
        <input
          type="checkbox"
          checked={rightsAccepted}
          onChange={(e) => setRightsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
        />
        <span>
          I understand that the text I paste may be someone else&apos;s copyrighted
          work, and that redistributing the finished bundle is my responsibility.
     </span>
   </label>

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
        type="submit"
        disabled={submitting || text.trim().length === 0}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-fg/30 border-t-primary-fg" />
            Submitting…
        </>
        ) : (
          <>
            Analyze story
            <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden />
        </>
        )}
   </button>
 </form>
  );
}
