import Link from "next/link";
import { Library } from "@/components/Library";

export default function StoriesPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">My Stories</h1>
          <Link
            href="/"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + New story
          </Link>
        </div>
        <Library />
      </div>
    </main>
  );
}
