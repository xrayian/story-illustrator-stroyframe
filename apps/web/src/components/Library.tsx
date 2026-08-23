"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface StoryRow {
  id: string;
  title: string;
  status: string;
  visual_skipped: boolean;
  voice_skipped: boolean;
  created_at: string;
  thumb: string | null;
}

const POLL_INTERVAL_MS = 5000;

const STATUS_LABEL: Record<string, string> = {
  created: "Queued",
  analyzing: "Analyzing",
  analysis_failed: "Analysis failed",
  cast_review: "Awaiting cast review",
  voice_generation: "Voicing",
  visual_generation: "Illustrating",
  assembling: "Assembling bundle",
  ready: "Ready",
  failed: "Failed",
};

export function Library() {
  const router = useRouter();
  const [rows, setRows] = useState<StoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const res = await fetch("/api/stories", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load library.");
        const data = (await res.json()) as { stories: StoryRow[] };
        if (!cancelled) {
          setRows(data.stories);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      }
    }
    void load();
    // Background poll while any story is mid-pipeline so coming back later shows fresh state.
    timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const onDelete = useCallback(
    async (id: string, title: string) => {
      if (!confirm(`Delete "${title}"? This removes the story, its generated assets, and any downloaded-R2 audio/images. The .svmp bundle cannot be regenerated after deletion.`)) return;
      const res = await fetch(`/api/stories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Delete failed.");
        return;
      }
      setRows((rs) => (rs ? rs.filter((r) => r.id !== id) : rs));
      router.refresh();
    },
    [router]
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
    );
  }
  if (!rows) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No stories yet. Paste a story on the home page to begin.
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {rows.map((s) => {
        const statusLabel = STATUS_LABEL[s.status] ?? s.status;
        const ready = s.status === "ready";
        return (
          <li
            key={s.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {s.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.thumb}
                  alt={s.title}
                  className="h-16 w-16 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                  no img
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/stories/${s.id}`} className="block truncate font-semibold text-slate-900 hover:underline">
                  {s.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(s.created_at).toLocaleString()}
                </p>
                <span
                  className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    ready
                      ? "bg-emerald-100 text-emerald-700"
                      : s.status.endsWith("failed")
                      ? "bg-red-100 text-red-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {ready ? (
                <>
                  <Link
                    href={`/play/${s.id}`}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                  >
                    Play
                  </Link>
                  <a
                    href={`/api/stories/${s.id}/bundle`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Download .svmp
                  </a>
                </>
              ) : (
                <Link
                  href={`/stories/${s.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open
                </Link>
              )}
              <button
                onClick={() => void onDelete(s.id, s.title)}
                className="rounded-lg border border-red-200 px-3 py-1.5 font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
