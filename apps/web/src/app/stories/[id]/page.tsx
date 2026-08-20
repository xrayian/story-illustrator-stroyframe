import Link from "next/link";
import { StoryView } from "@/components/StoryView";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← New story
        </Link>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <StoryView storyId={id} />
        </div>
      </div>
    </main>
  );
}