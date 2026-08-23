import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StoryView } from "@/components/StoryView";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <Link
        href="/stories"
        className="inline-flex items-center gap-1 text-sm text-fg-muted transition hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All stories
    </Link>
      <div className="mt-4">
        <StoryView storyId={id} />
    </div>
  </main>
  );
}
