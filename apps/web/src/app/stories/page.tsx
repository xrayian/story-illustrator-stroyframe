import Link from "next/link";
import { Plus } from "lucide-react";
import { Library } from "@/components/Library";

export default function StoriesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Library</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg text-balance sm:text-4xl">
            My Stories
      </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Every story you&apos;ve started — finish the pipeline, play, or download a .svmp.
    </p>
  </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New story
  </Link>
</header>
      <Library />
</main>
  );
}
