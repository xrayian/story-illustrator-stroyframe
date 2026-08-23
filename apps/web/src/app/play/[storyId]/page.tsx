import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BundleLoader } from "@/components/BundleLoader";

export default async function PlayStoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <Link
        href={`/stories/${storyId}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted transition hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Story
    </Link>
      <header className="mt-4 mb-6 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Player</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg text-balance">
          Now playing
      </h1>
  </header>
      <BundleLoader storyId={storyId} />
</main>
  );
}
