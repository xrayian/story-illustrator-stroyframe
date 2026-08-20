import Link from "next/link";
import { BundleLoader } from "@/components/BundleLoader";

export default async function PlayStoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href={`/stories/${storyId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Story
        </Link>
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Player</h1>
        <BundleLoader storyId={storyId} />
      </div>
    </main>
  );
}
