"use client";

import { useCallback, useState } from "react";
import { BundleLoader } from "@/components/BundleLoader";

export default function PlayPage() {
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && /\.svmp$/i.test(f.name)) setFile(f);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Open local .svmp</h1>

        {!file && (
          <label
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-white p-12 text-center transition hover:border-slate-400 hover:bg-slate-50"
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
            <p className="text-sm text-slate-600">Drop a <code>.svmp</code> file here or click to choose one.</p>
            <p className="mt-1 text-xs text-slate-400">
              Plays fully offline — the file stays in your browser, no upload.
            </p>
          </label>
        )}

        {file && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Playing: <span className="font-mono">{file.name}</span>
              </p>
              <button
                onClick={() => setFile(null)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Choose different file
              </button>
            </div>
            <BundleLoader file={file} />
          </div>
        )}
      </div>
    </main>
  );
}
