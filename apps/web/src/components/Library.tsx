"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  ImageOff,
  Library as LibraryIcon,
  Loader2,
  Play,
  Plus,
  Trash2,
} from "lucide-react";

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

type StatusKind = "queued" | "active" | "ready" | "failed";

const STATUS_META: Record<string, { label: string; kind: StatusKind; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }> = {
  created: { label: "Queued", kind: "queued", icon: Loader2 },
  analyzing: { label: "Analyzing", kind: "active", icon: Loader2 },
  analysis_failed: { label: "Analysis failed", kind: "failed", icon: AlertCircle },
  cast_review: { label: "Cast review", kind: "active", icon: Loader2 },
  voice_generation: { label: "Voicing", kind: "active", icon: Loader2 },
  visual_generation: { label: "Illustrating", kind: "active", icon: Loader2 },
  assembling: { label: "Assembling", kind: "active", icon: Loader2 },
  ready: { label: "Ready", kind: "ready", icon: CheckCircle2 },
  failed: { label: "Failed", kind: "failed", icon: AlertCircle },
};

function Badge({ kind }: { kind: StatusKind }) {
  const cls =
    kind === "ready"
      ? "bg-success-bg text-success-fg"
      : kind === "failed"
        ? "bg-danger-bg text-danger-fg"
        : kind === "active"
          ? "bg-primary/10 text-primary"
          : "bg-surface text-fg-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          kind === "ready"
            ? "bg-success"
            : kind === "failed"
              ? "bg-danger"
              : kind === "active"
                ? "bg-primary animate-pulse-soft"
                : "bg-fg-subtle"
        }`}
      />
      <span className="sr-only">Status</span>
  </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, kind: "queued" as StatusKind, icon: Loader2 };
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted">
      <Icon
        className={`h-3.5 w-3.5 ${
          meta.kind === "active"
            ? "animate-spin text-primary"
            : meta.kind === "failed"
              ? "text-danger"
              : meta.kind === "ready"
                ? "text-success"
                : "text-fg-muted"
        }`}
        aria-hidden
      />
      {meta.label}
  </span>
  );
}

export function Library() {
  const router = useRouter();
  const [rows, setRows] = useState<StoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
    timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const onDelete = useCallback(
    async (id: string, title: string) => {
      if (
        !confirm(
          `Delete "${title}"? This removes the story, its generated assets, and any downloaded-R2 audio/images. The .svmp bundle cannot be regenerated after deletion.`
        )
      )
        return;
      setPendingDelete(id);
      try {
        const res = await fetch(`/api/stories/${id}`, { method: "DELETE" });
        if (!res.ok) {
          alert("Delete failed.");
          return;
        }
        setRows((rs) => (rs ? rs.filter((r) => r.id !== id) : rs));
        router.refresh();
      } finally {
        setPendingDelete(null);
      }
    },
    [router]
  );

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{error}</span>
    </div>
    );
  }
  if (!rows) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-elev p-6 text-sm text-fg-muted shadow-card">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your stories…
    </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-bg-elev p-10 text-center shadow-card">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LibraryIcon className="h-6 w-6" aria-hidden />
    </span>
        <div>
          <p className="font-display text-base font-semibold text-fg">No stories yet</p>
          <p className="mt-1 text-sm text-fg-muted">Paste a story on the home page to begin</p>
    </div>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New story
    </Link>
  </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((s) => {
        const meta = STATUS_META[s.status] ?? { kind: "queued" as StatusKind };
        const ready = s.status === "ready";
        const isDeleting = pendingDelete === s.id;
        return (
          <li
            key={s.id}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <Link href={`/stories/${s.id}`} className="relative block aspect-[4/3] overflow-hidden bg-surface">
              {s.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.thumb}
                  alt={s.title}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-surface to-accent/10 text-fg-subtle">
                  <div className="flex flex-col items-center gap-1 text-xs">
                    <ImageOff className="h-5 w-5" aria-hidden />
                    no preview
          </div>
          </div>
              )}
              <div className="absolute left-2 top-2">
                <Badge kind={meta.kind} />
             </div>
          </Link>

            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="min-w-0">
                <Link
                  href={`/stories/${s.id}`}
                  className="block truncate font-display text-base font-semibold text-fg transition hover:text-primary"
                >
                  {s.title}
          </Link>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Created {new Date(s.created_at).toLocaleString()}
          </p>
            </div>
              <StatusBadge status={s.status} />
              {(s.voice_skipped || s.visual_skipped) && (
                <p className="-mt-1 text-[11px] text-fg-subtle">
                  {[s.voice_skipped && "voice skipped", s.visual_skipped && "visuals skipped"]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
              )}

              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                {ready ? (
                  <>
                    <Link
                      href={`/play/${s.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-fg transition hover:bg-primary-hover"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      Play
            </Link>
                    <a
                      href={`/api/stories/${s.id}/bundle`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface hover:text-fg"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      .svmp
            </a>
           </>
                ) : (
                  <Link
                    href={`/stories/${s.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface hover:text-fg"
                  >
                    Open
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
                )}
                <button
                  onClick={() => void onDelete(s.id, s.title)}
                  disabled={isDeleting}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger-fg transition hover:bg-danger-bg disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Delete
          </button>
        </div>
      </div>
    </li>
        );
      })}
  </ul>
  );
}
