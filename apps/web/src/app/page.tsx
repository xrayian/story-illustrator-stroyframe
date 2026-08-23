import Link from "next/link";
import { PasteForm } from "@/components/PasteForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Storyframe</h1>
          <Link
            href="/stories"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            My Stories
          </Link>
        </div>
        <p className="mb-8 mt-1 text-slate-600">
          Paste a story, get an illustrated, narrated, redistributable media bundle.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <PasteForm />
        </div>
      </div>
    </main>
  );
}