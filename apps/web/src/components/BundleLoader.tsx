"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { parseBundle, type ParsedBundle } from "@/lib/parseBundle";
import { ScenePlayer } from "./ScenePlayer";

interface BundleLoaderProps {
  /** If provided, fetches the bundle from the server (hosted mode). */
  storyId?: string;
  /** If provided, parses an in-memory .svmp file (drag-and-drop mode). */
  file?: File | null;
}

export function BundleLoader({ storyId, file }: BundleLoaderProps) {
  const [bundle, setBundle] = useState<ParsedBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bundleRef = useRef<ParsedBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let zip: Uint8Array;
        if (storyId) {
          const res = await fetch(`/api/stories/${storyId}/bundle`, { cache: "no-store" });
          if (res.status === 404) throw new Error("Story not found.");
          if (res.status === 409) throw new Error("Story hasn't reached ready yet — finish the pipeline first.");
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error ?? `Failed to load bundle (${res.status}).`);
          }
          zip = new Uint8Array(await res.arrayBuffer());
        } else if (file) {
          zip = new Uint8Array(await file.arrayBuffer());
        } else {
          throw new Error("Nothing to load.");
        }
        const parsed = await parseBundle(zip);
        if (cancelled) {
          parsed.dispose();
          return;
        }
        bundleRef.current?.dispose();
        bundleRef.current = parsed;
        setBundle(parsed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load bundle.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (storyId || file) void load();
    return () => {
      cancelled = true;
    };
  }, [storyId, file]);

  useEffect(() => {
    return () => {
      bundleRef.current?.dispose();
      bundleRef.current = null;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-elev p-6 text-sm text-fg-muted shadow-card">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading bundle…
     </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger-fg">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{error}</span>
     </div>
    );
  }
  if (!bundle) return null;
  return <ScenePlayer bundle={bundle} />;
}
