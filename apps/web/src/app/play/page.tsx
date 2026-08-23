"use client";

import { useCallback, useState } from "react";
import { FileAudio, Upload } from "lucide-react";
import { BundleLoader } from "@/components/BundleLoader";

export default function PlayPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && /\.svmp$/i.test(f.name)) setFile(f);
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-12">
      <header className="mb-6 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Player</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg text-balance sm:text-4xl">
          Open local .svmp
      </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Plays fully offline — the file stays in your browser, no upload.
    </p>
  </header>

      {!file ? (
        <label
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-bg-elev p-12 text-center transition ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary hover:bg-surface"
          }`}
        >
          <input
            type="file"
            accept=".svmp,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-5 w-5" aria-hidden />
    </span>
          <div>
            <p className="font-display text-base font-semibold text-fg">
              Drop a <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.85em]">.svmp</code> file here
           </p>
            <p className="mt-1 text-sm text-fg-muted">or click to choose one</p>
  </div>
       </label>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-elev p-3 shadow-card">
            <div className="flex items-center gap-2.5 text-sm text-fg-muted">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileAudio className="h-4 w-4" aria-hidden />
      </span>
              <div>
                <p className="text-xs text-fg-subtle">Playing</p>
                <p className="font-mono text-sm text-fg">{file.name}</p>
       </div>
      </div>
              <button
                onClick={() => setFile(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface hover:text-fg"
              >
                Choose different file
      </button>
    </div>
          <BundleLoader file={file} />
  </div>
      )}
</main>
  );
}
